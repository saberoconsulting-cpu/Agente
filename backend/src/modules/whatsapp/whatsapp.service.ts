import { BadRequestException, ForbiddenException, Injectable, Optional, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { createHmac, timingSafeEqual } from 'crypto';
import { DatabaseService } from '../database/database.service';
import { AuditService } from '../audit/audit.service';
import { EventsService } from '../events/events.service';
import { SalesAgentService } from '../sales-agent/sales-agent.service';
import { WhatsappConnectionsService } from './whatsapp-connections.service';
import { MessagePresentation, MessageStore } from '../platform/message-store.service';
import { ConversationControlService } from '../conversations/conversation-control.service';
import { PlatformService } from '../platform/platform.service';

type WhatsappMessage = {
  id: string;
  from: string;
  phoneNumberId?: string;
  timestamp?: string;
  type?: string;
  text?: { body?: string };
  contactName?: string;
  document?: { id: string; filename?: string; mime_type?: string; caption?: string };
  image?: { id: string; mime_type?: string; caption?: string };
  audio?: { id: string; mime_type?: string };
  video?: { id: string; mime_type?: string; caption?: string };
};

@Injectable()
export class WhatsappService {
  constructor(
    private readonly config: ConfigService,
    private readonly db: DatabaseService,
    private readonly salesAgent: SalesAgentService,
    private readonly events: EventsService,
    private readonly audit: AuditService,
    private readonly connections: WhatsappConnectionsService,
    private readonly messages: MessageStore,
    private readonly platform: PlatformService,
    @Optional() private readonly control?: ConversationControlService,
  ) {}

  verifyWebhook(mode: string, verifyToken: string, challenge: string) {
    const expected = this.config.get<string>('META_WEBHOOK_VERIFY_TOKEN')
      || this.config.get<string>('WHATSAPP_VERIFY_TOKEN');

    if (mode === 'subscribe' && verifyToken === expected) {
      return challenge;
    }

    throw new ForbiddenException('Invalid webhook verification token');
  }

  async receiveWebhook(body: unknown, rawBody?: Buffer, signature?: string) {
    this.validateSignature(rawBody, signature);
    if (this.platform?.managed) await this.platform.company();

    const eventId = await this.saveInboundEvent(body);
    const messages = this.extractMessages(body);

    for (const message of messages) {
      const saved = await this.upsertInboundMessage(eventId, message);
      if (saved.inserted) {
        void this.processInboundMessage(message, saved).catch((error) => {
          console.error('Failed to process WhatsApp message', {
            message_id: message.id,
            error: error instanceof Error ? error.message : String(error),
          });
        });
      }
    }
  }

  async sendWhatsAppText(to: string, text: string, companyId?: string) {
    if(this.control&&companyId){
      const conversation=await this.db.query('select id from conversations where company_id=$1 and external_id=$2 and channel=\'whatsapp\'',[companyId,to]);
      if(conversation.rows[0]){
        const attention=await this.control.get(companyId,conversation.rows[0].id);
        const result=await this.control.sendIfAutomatic(companyId,conversation.rows[0].id,attention.version,()=>this.sendText(to,text,companyId));
        if(!result)throw new BadRequestException('Atención humana activa; seguimiento automático detenido.');
        return result;
      }
    }
    return this.sendText(to, text, companyId);
  }

  private async processInboundMessage(
    message: WhatsappMessage,
    saved: { conversationId: string; leadId: string },
  ) {
    const companyId = await this.resolveCompanyId(message.phoneNumberId);
    const attention = this.control ? await this.control.get(companyId, saved.conversationId) : { mode: 'auto' as const, version: undefined };
    if (attention.mode === 'human') {
      const text=message.text?.body?.trim();
      if(text&&this.isOptOut(text))await this.registerOptOut(companyId,message.from,text);
      return;
    }
    const automaticSend = (text: string) => this.control
      ? this.control.sendIfAutomatic(companyId, saved.conversationId, attention.version, () => this.sendText(message.from, text, companyId))
      : this.sendText(message.from, text, companyId);
    const inboundText = message.text?.body?.trim();

    if (!inboundText) {
      await automaticSend(
        `Hola, soy el asistente virtual de ${this.config.get<string>('COMPANY_NAME') || 'la empresa'}. Por ahora puedo ayudarte mejor si me envias tu consulta en texto.`,
      );
      return;
    }

    if (this.isOptOut(inboundText)) {
      await this.registerOptOut(companyId, message.from, inboundText);
      await automaticSend(
        'Entendido. No te enviaremos mas mensajes de seguimiento por WhatsApp. Si deseas retomar la conversacion, puedes escribirnos nuevamente.',
      );
      return;
    }

    const response = await this.salesAgent.respondToMessage({
      companyId,
      message: inboundText,
      conversationId: saved.conversationId,
      leadId: saved.leadId,
      inboundMessageId: message.id,
    });

    await automaticSend(response.answer);
  }

  private validateSignature(rawBody?: Buffer, signature?: string) {
    const required = this.config.get<string>('WEBHOOK_SIGNATURE_REQUIRED') === 'true';
    const appSecret = this.config.get<string>('META_APP_SECRET');

    if (!required) return;
    if (!rawBody || !signature || !appSecret) {
      throw new ForbiddenException('Missing Meta signature data');
    }

    const expected = `sha256=${createHmac('sha256', appSecret)
      .update(rawBody)
      .digest('hex')}`;

    const expectedBuffer = Buffer.from(expected);
    const receivedBuffer = Buffer.from(signature);

    if (
      expectedBuffer.length !== receivedBuffer.length ||
      !timingSafeEqual(expectedBuffer, receivedBuffer)
    ) {
      throw new ForbiddenException('Invalid Meta signature');
    }
  }

  private async saveInboundEvent(payload: unknown): Promise<string> {
    return this.messages.inboundEvent(payload);
  }

  private extractMessages(payload: unknown): WhatsappMessage[] {
    if (!payload || typeof payload !== 'object') return [];

    const entries = (payload as { entry?: unknown[] }).entry || [];
    const messages: WhatsappMessage[] = [];

    for (const entry of entries) {
      const changes = (entry as { changes?: unknown[] }).changes || [];
      for (const change of changes) {
        const value = (change as {
          value?: {
            messages?: WhatsappMessage[];
            metadata?: { phone_number_id?: string };
            contacts?: { wa_id: string; profile?: { name?: string } }[];
          };
        }).value;
        for (const message of value?.messages || []) {
          if (message.id && message.from) {
            messages.push({
              ...message,
              phoneNumberId: value?.metadata?.phone_number_id,
              contactName: value?.contacts?.find(contact => contact.wa_id === message.from)?.profile?.name?.slice(0,150),
            });
          }
        }
      }
    }

    return messages;
  }

  private async upsertInboundMessage(
    eventId: string,
    message: WhatsappMessage,
  ): Promise<{ inserted: boolean; conversationId: string; leadId: string }> {
    const text = message.text?.body || null;
    const companyId = await this.resolveCompanyId(message.phoneNumberId);
    this.platform?.assertCompany(companyId);

    const leadResult = await this.db.query<{ id: string }>(
      `insert into leads (company_id, whatsapp_number, name)
       values ($1, $2, $3)
       on conflict (company_id, whatsapp_number)
       do update set updated_at = now(),name=coalesce(leads.name,excluded.name)
       returning id`,
      [companyId, message.from, message.contactName || null],
    );

    const conversation = await this.db.query<{ id: string }>(
      `insert into conversations (company_id, lead_id, channel, external_id)
       select $1, $3::uuid, 'whatsapp', $2
       from leads l
       where l.company_id = $1 and l.whatsapp_number = $2
       on conflict (company_id, channel, external_id)
       do update set updated_at = now()
       returning id`,
      [companyId, message.from, leadResult.rows[0].id],
    );

    await this.platform.contact(companyId, leadResult.rows[0].id, message.from);
    const attachment = message.document || message.image || message.audio || message.video;
    const insertResult = await this.messages.save({ companyId, conversationId: conversation.rows[0].id,
      providerMessageId: message.id, direction: 'inbound', messageType: message.type || 'unknown',
      textBody: text || (attachment && 'caption' in attachment && typeof attachment.caption==='string' ? attachment.caption : null), rawPayload: message, inboundEventId: eventId,
      ...(message.timestamp && Number.isFinite(Number(message.timestamp)) && Number(message.timestamp)>0 ? {createdAt:new Date(Number(message.timestamp)*1000)}:{}),
      presentation: {sender:'contact',...(message.contactName?{sender_name:message.contactName}:{}),...(attachment?{attachment:{id:attachment.id,kind:message.type||'document',filename:message.document?.filename,mime_type:attachment.mime_type}}:{})} });

    if (insertResult.inserted) {
      await this.events.record({
        companyId,
        eventType: 'message.received',
        aggregateType: 'conversation',
        aggregateId: conversation.rows[0].id,
        payload: {
          lead_id: leadResult.rows[0].id,
          channel: 'whatsapp',
          provider_message_id: message.id,
        },
      });
    }

    return {
      inserted: insertResult.inserted,
      conversationId: conversation.rows[0].id,
      leadId: leadResult.rows[0].id,
    };
  }

  private async sendText(to: string, text: string, companyId?: string) {
    return this.deliver(to, { type: 'text', text: { body: text } }, text, companyId, {sender:'ai'});
  }

  private async deliver(to: string, content: Record<string, unknown>, preview: string, companyId?: string, presentation?: MessagePresentation) {
    const company = companyId || this.config.get<string>('COMPANY_ID') || 'sabero';
    this.platform?.assertCompany(company);
    if (this.platform?.managed) await this.platform.company();
    const {token,phoneNumberId} = await this.resolveSendCredentials(companyId);
    if (!token || !phoneNumberId) throw new BadRequestException('WhatsApp no está conectado.');
    let response;
    try {
      response = await axios.post(`https://graph.facebook.com/${this.version()}/${phoneNumberId}/messages`,
        {messaging_product:'whatsapp',to,...content}, {headers:{Authorization:`Bearer ${token}`},timeout:15000});
    } catch { throw new ServiceUnavailableException('Meta no confirmó el envío. Revisa la conversación antes de volver a enviarlo.'); }
    const providerMessageId = response.data?.messages?.[0]?.id;
    if (!providerMessageId) throw new ServiceUnavailableException('El proveedor no confirmó el mensaje.');
    const result = await this.db.query<{id:string}>(`insert into conversations(company_id,channel,external_id)
      values($1,'whatsapp',$2) on conflict(company_id,channel,external_id) do update set updated_at=now() returning id`,[company,to]);
    await this.messages.save({companyId:company,conversationId:result.rows[0].id,providerMessageId,direction:'outbound',
      messageType:String(content.type),textBody:preview,rawPayload:response.data,presentation});
    if (!this.messages.mongo) await this.db.query(`insert into outbound_messages(company_id,recipient,text_body,provider_message_id,raw_response) values($1,$2,$3,$4,$5)`,[company,to,preview,providerMessageId,JSON.stringify(response.data)]);
    await this.events.record({companyId:company,eventType:'message.sent',aggregateType:'whatsapp',aggregateId:providerMessageId,payload:{recipient:to,sender:presentation?.sender||'ai'}});
    return {provider_message_id:providerMessageId};
  }

  private version() { return this.config.get<string>('META_GRAPH_API_VERSION') || 'v25.0'; }

  async approvedTemplates(companyId: string) {
    this.platform.assertCompany(companyId);
    const connection = await this.connections.findActiveForCompany(companyId);
    const waba = connection?.waba_id || this.config.get<string>('META_WABA_ID');
    const {token} = await this.resolveSendCredentials(companyId);
    if (!waba || !token) return [];
    try {
      const response = await axios.get(`https://graph.facebook.com/${this.version()}/${waba}/message_templates`,{headers:{Authorization:`Bearer ${token}`},params:{fields:'name,status,language,components',limit:100},timeout:15000});
      return (response.data?.data || []).filter((item:any)=>item.status==='APPROVED').map((item:any)=>({name:item.name,language:item.language,components:item.components||[]}));
    } catch { throw new ServiceUnavailableException('No se pudieron consultar las plantillas aprobadas de WhatsApp.'); }
  }

  async sendOperator(companyId: string, to: string, input: {text?:string;template_name?:string;language?:string;parameters?:string[];media?:{id:string;filename:string;mime_type:string}}, senderName: string) {
    let content: Record<string,unknown>;
    let preview = input.text || '';
    const presentation:MessagePresentation={sender:'human',sender_name:senderName.slice(0,150)};
    if(input.template_name){
      const templates=await this.approvedTemplates(companyId);
      const template=templates.find((item:any)=>item.name===input.template_name&&item.language===input.language);
      if(!template)throw new BadRequestException('Selecciona una plantilla aprobada y su idioma.');
      const body=template.components.find((item:any)=>item.type==='BODY')?.text||'';
      const required=[...body.matchAll(/\{\{(\d+)\}\}/g)].map((match:any)=>Number(match[1]));
      const count=required.length?Math.max(...required):0;
      const params=input.parameters||[];
      if(params.length!==count||params.some(value=>typeof value!=='string'||!value.trim()||value.length>1000))throw new BadRequestException('Completa los valores de la plantilla aprobada.');
      if(template.components.some((item:any)=>(item.type==='HEADER'&&(item.format!=='TEXT'||/\{\{/.test(item.text||'')))||(item.type==='BUTTONS'&&item.buttons?.some((button:any)=>/\{\{/.test(button.url||'')))))throw new BadRequestException('Esta plantilla requiere contenido adicional. Elige una plantilla de texto.');
      content={type:'template',template:{name:template.name,language:{code:template.language},...(count?{components:[{type:'body',parameters:params.map(text=>({type:'text',text}))}]}:{})}};
      preview=body.replace(/\{\{(\d+)\}\}/g,(_:string,index:string)=>params[Number(index)-1]||'');
    } else if(input.media){
      if(preview.length>1024)throw new BadRequestException('El texto junto al archivo admite hasta 1024 caracteres.');
      const kind=input.media.mime_type.startsWith('image/')?'image':'document';
      content={type:kind,[kind]:{id:input.media.id,...(kind==='document'?{filename:input.media.filename}:{}),...(preview?{caption:preview}:{})}};
      presentation.attachment={id:input.media.id,kind,filename:input.media.filename,mime_type:input.media.mime_type};
      if(!preview)preview=input.media.filename;
    }else{
      if(!preview.trim()||preview.length>4096)throw new BadRequestException('Escribe un mensaje de hasta 4096 caracteres.');
      content={type:'text',text:{body:preview}};
    }
    return this.deliver(to,content,preview,companyId,presentation);
  }

  async uploadMedia(companyId:string,file:{buffer:Buffer;originalname:string;mimetype:string}){
    this.platform.assertCompany(companyId);
    const allowed=['application/pdf','image/jpeg','image/png','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];
    if(!allowed.includes(file.mimetype)||file.buffer.length>16*1024*1024)throw new BadRequestException('Usa PDF, imagen o documento de Office de hasta 16 MB.');
    if(file.mimetype.startsWith('image/')&&file.buffer.length>5*1024*1024)throw new BadRequestException('Las imágenes admiten hasta 5 MB.');
    const {token,phoneNumberId}=await this.resolveSendCredentials(companyId);
    const form=new FormData();form.append('messaging_product','whatsapp');form.append('file',new Blob([new Uint8Array(file.buffer)],{type:file.mimetype}),file.originalname);
    try{const response=await axios.post(`https://graph.facebook.com/${this.version()}/${phoneNumberId}/media`,form,{headers:{Authorization:`Bearer ${token}`},timeout:30000});if(!response.data?.id)throw new Error();return String(response.data.id);}
    catch{throw new ServiceUnavailableException('WhatsApp no pudo recibir el archivo.');}
  }

  async downloadMedia(companyId:string,mediaId:string){
    this.platform.assertCompany(companyId);
    if(!/^[a-zA-Z0-9_-]{1,300}$/.test(mediaId))throw new BadRequestException('Archivo no válido.');
    const {token}=await this.resolveSendCredentials(companyId);
    try{
      const metadata=await axios.get(`https://graph.facebook.com/${this.version()}/${mediaId}`,{headers:{Authorization:`Bearer ${token}`},timeout:10000});
      const url=new URL(metadata.data.url);
      if(url.protocol!=='https:'||!['facebook.com','fbcdn.net','fbsbx.com','whatsapp.net'].some(domain=>url.hostname===domain||url.hostname.endsWith('.'+domain)))throw new Error();
      const response=await axios.get(url.toString(),{headers:{Authorization:`Bearer ${token}`},responseType:'arraybuffer',maxContentLength:30*1024*1024,timeout:30000,maxRedirects:0});
      return Buffer.from(response.data);
    }catch{throw new ServiceUnavailableException('El archivo ya no está disponible para descargar en WhatsApp.');}
  }

  private isOptOut(text: string) {
    return /\b(stop|baja|cancelar|no escribir|no me escriban|salir|unsubscribe)\b/i.test(text);
  }

  private async registerOptOut(companyId: string, recipient: string, reason: string) {
    await this.db.query(
      `insert into opt_outs (company_id, channel, recipient, reason)
       values ($1, 'whatsapp', $2, $3)
       on conflict (company_id, channel, recipient)
       do update set opted_out_at = now(), reason = excluded.reason`,
      [companyId, recipient, reason],
    );
    await this.audit.record({
      companyId,
      action: 'recipient.opted_out',
      resourceType: 'whatsapp_recipient',
      resourceId: recipient,
      metadata: { reason },
    });
  }

  private async resolveCompanyId(phoneNumberId?: string) {
    if (phoneNumberId) {
      const connection = await this.connections.findActiveByPhoneNumberId(phoneNumberId);
      if (connection) {
        this.platform?.assertCompany(connection.company_id);
        return connection.company_id;
      }
    }

    if (this.platform?.managed) throw new ForbiddenException('Unknown WhatsApp phone number for this company');

    return this.config.get<string>('COMPANY_ID') || 'sabero';
  }

  private async resolveSendCredentials(companyId?: string) {
    if (companyId) {
      const connection = await this.connections.findActiveForCompany(companyId);
      if (connection) {
        return {
          token: this.connections.decryptAccessToken(connection),
          phoneNumberId: connection.phone_number_id,
        };
      }
    }

    return {
      token: this.config.get<string>('META_ACCESS_TOKEN')
        || this.config.get<string>('WHATSAPP_ACCESS_TOKEN')
        || this.config.get<string>('WHATSAPP_TOKEN'),
      phoneNumberId: this.config.get<string>('META_PHONE_NUMBER_ID')
        || this.config.get<string>('WHATSAPP_PHONE_NUMBER_ID'),
    };
  }
}
