import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { createHash } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../database/database.service';
import { MessageStore } from '../platform/message-store.service';
import { toConversationMessage } from '../conversations/conversation-message.types';
import { ConversationControlService } from '../conversations/conversation-control.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { OpportunitiesService } from '../opportunities/opportunities.service';
import { SalesPipelineService } from '../sales-pipeline/sales-pipeline.service';
import { CalendarService } from '../calendar/calendar.service';
import { GoogleCalendarService } from '../integrations/google/google-calendar.service';
import { FollowupsService } from '../followups/followups.service';
import { AuditService } from '../audit/audit.service';
import { AuthTokenPayload } from '../auth/token';

export type OperatorInput = { request_id: string; text?: string; media_id?: string; template_name?: string; language?: string; parameters?: string[] };
@Injectable()
export class ContactWorkspaceService {
  constructor(private readonly db: DatabaseService, private readonly messages: MessageStore,
    private readonly control: ConversationControlService, private readonly whatsapp: WhatsappService,
    private readonly opportunities: OpportunitiesService, private readonly pipeline: SalesPipelineService,
    private readonly calendar: CalendarService, private readonly google: GoogleCalendarService,
    private readonly followups: FollowupsService, private readonly audit: AuditService, private readonly config: ConfigService) {}

  templates(companyId:string){return this.whatsapp.approvedTemplates(companyId);}

  async lead(companyId: string, id: string) {
    const result = await this.db.query('select * from leads where company_id=$1 and id=$2', [companyId, id]);
    if (!result.rowCount) throw new NotFoundException('Contacto no encontrado');
    return result.rows[0];
  }
  async conversations(companyId: string, leadId: string) {
    await this.lead(companyId, leadId);
    return (await this.db.query('select id,state,created_at,updated_at from conversations where company_id=$1 and lead_id=$2 order by updated_at desc', [companyId, leadId])).rows;
  }
  async conversation(companyId: string, leadId: string, conversationId?: string) {
    const rows = await this.conversations(companyId, leadId);
    const row = conversationId ? rows.find(item => item.id === conversationId) : rows[0];
    if (!row) throw new NotFoundException('Conversación no encontrada');
    return row;
  }
  private async opportunity(companyId: string, leadId: string) {
    await this.lead(companyId, leadId);
    const conversation = await this.conversation(companyId, leadId);
    await this.pipeline.ensure({companyId,leadId,conversationId:conversation.id});
    const result = await this.db.query('select id from opportunities where company_id=$1 and lead_id=$2 order by created_at desc limit 1',[companyId,leadId]);
    if (!result.rowCount) throw new NotFoundException('Oportunidad no encontrada');
    return result.rows[0].id as string;
  }
  async detail(companyId: string, leadId: string) {
    const contact = await this.lead(companyId,leadId);
    const conversations = await this.conversations(companyId,leadId);
    const latest=conversations[0];
    if(!contact.name&&typeof latest?.state?.booking?.name==='string')contact.name=latest.state.booking.name;
    const summaries=await this.messages.summary(companyId,conversations.map(item=>item.id));
    const inbound=await this.messages.summary(companyId,conversations.map(item=>item.id),'inbound');
    const lastInbound=inbound.length?Math.max(...inbound.map(item=>new Date(item.lastMessageAt).getTime())):0;
    const opp=(await this.db.query('select id from opportunities where company_id=$1 and lead_id=$2 order by created_at desc limit 1',[companyId,leadId])).rows[0];
    const [opportunity,meetings,followups,configuration,google,interventions]=await Promise.all([
      opp?this.opportunities.detail(companyId,opp.id):Promise.resolve(null),
      this.db.query("select id,title,start_time,end_time,status,attendee_email,coalesce(raw_response->>'hangoutLink',raw_response->'conferenceData'->'entryPoints'->0->>'uri') as meet_link from meetings where company_id=$1 and lead_id=$2 order by start_time desc limit 30",[companyId,leadId]),
      this.db.query('select id,message,scheduled_at,status,reason from followups where company_id=$1 and lead_id=$2 order by scheduled_at desc limit 30',[companyId,leadId]),
      this.pipeline.configuration(companyId),
      this.db.query('select exists(select 1 from google_oauth_connections where company_id=$1 and revoked_at is null) as connected',[companyId]),
      this.db.query(`select a.id,a.action,a.created_at,u.email as actor_email from audit_logs a
        left join admin_users u on u.id::text=a.actor_id and u.company_id=a.company_id
        where a.company_id=$1 and ((a.resource_type='lead' and a.resource_id=$2) or (a.resource_type='conversation' and a.resource_id=any($3::text[])))
        order by a.created_at desc limit 30`,[companyId,leadId,conversations.map(item=>item.id)]),
    ]);
    const scheduling=await this.db.query("select policy_text from negotiation_policies where company_id=$1 and policy_key='scheduling_enabled' and active=true",[companyId]);
    return {contact,conversations:conversations.map(item=>({id:item.id,created_at:item.created_at,attention:item.state?.attention||{mode:'auto'}})),
      conversation_id:latest?.id||null,attention:latest?.state?.attention||{mode:'auto'},opportunity,
      meetings:meetings.rows,followups:followups.rows,configuration,interventions:interventions.rows,
      calendar:{enabled:configuration.mode==='services'&&(scheduling.rows[0]?.policy_text==='true'||companyId==='sabero'),connected:google.rows[0]?.connected===true,timezone:this.config.get<string>('DEFAULT_TIMEZONE')||'America/Lima'},
      first_contact_at:summaries.length?new Date(Math.min(...summaries.map(item=>new Date(item.firstMessageAt||contact.created_at).getTime()))):contact.created_at,
      last_contact_at:summaries.length?new Date(Math.max(...summaries.map(item=>new Date(item.lastMessageAt).getTime()))):null,
      window_open:lastInbound>0&&Date.now()-lastInbound<24*60*60*1000};
  }
  async page(companyId:string,leadId:string,conversationId?:string,cursor?:string){
    const conversation=await this.conversation(companyId,leadId,conversationId);
    const page=await this.messages.list(companyId,conversation.id,60,cursor);
    return {items:page.items.map(toConversationMessage),next_cursor:page.nextCursor};
  }
  async attention(companyId:string,leadId:string,user:AuthTokenPayload,mode:'auto'|'human'){
    if(!['auto','human'].includes(mode))throw new BadRequestException('Modo de atención no válido');
    const conversation=await this.conversation(companyId,leadId);
    return this.control.change(companyId,conversation.id,user.sub,mode);
  }
  async stage(companyId:string,leadId:string,user:AuthTokenPayload,stage:string){
    const id=await this.opportunity(companyId,leadId);
    return this.opportunities.changeStage(companyId,id,stage,user.sub);
  }
  async note(companyId:string,leadId:string,user:AuthTokenPayload,content:string,nextAction?:string){
    if(typeof content!=='string'||!content.trim()||content.length>2000)throw new BadRequestException('Escribe una nota de hasta 2000 caracteres.');
    return this.opportunities.note(companyId,await this.opportunity(companyId,leadId),user.sub,content.trim(),nextAction?.slice(0,500));
  }
  async assign(companyId:string,leadId:string,user:AuthTokenPayload,assigneeId:string){
    return this.opportunities.assign(companyId,await this.opportunity(companyId,leadId),assigneeId,user.sub);
  }
  async send(companyId:string,leadId:string,user:AuthTokenPayload,input:OperatorInput){
    if(!/^[a-f0-9-]{36}$/i.test(input.request_id||''))throw new BadRequestException('Falta el identificador de envío.');
    if(input.text!==undefined&&(typeof input.text!=='string'||input.text.length>4096))throw new BadRequestException('El mensaje supera 4096 caracteres.');
    if(input.parameters!==undefined&&(!Array.isArray(input.parameters)||input.parameters.length>30||input.parameters.some(value=>typeof value!=='string'||value.length>1000)))throw new BadRequestException('Parámetros de plantilla no válidos.');
    if(input.template_name&&(!/^[a-z0-9_]{1,512}$/.test(input.template_name)||typeof input.language!=='string'||!/^[a-zA-Z_]{2,10}$/.test(input.language)))throw new BadRequestException('Plantilla no válida.');
    if(input.media_id&&!/^[a-f0-9-]{36}$/i.test(input.media_id))throw new BadRequestException('Archivo no válido.');
    const lead=await this.lead(companyId,leadId);
    const conversation=await this.conversation(companyId,leadId);
    return this.db.conversationLock(companyId,conversation.id,async()=>{
      const attention=await this.control.get(companyId,conversation.id);
      if(attention.mode!=='human'||attention.assignee_id!==user.sub)throw new ConflictException('Toma la conversación antes de responder.');
      const optOut=await this.db.query("select 1 from opt_outs where company_id=$1 and recipient=$2 and channel='whatsapp'",[companyId,lead.whatsapp_number]);
      if(optOut.rowCount)throw new BadRequestException('Este contacto pidió no recibir mensajes.');
      const summaries=await this.messages.summary(companyId,[conversation.id],'inbound');
      const last=summaries.length?Math.max(...summaries.map(row=>new Date(row.lastMessageAt).getTime())):0;
      if(!input.template_name&&(!last||Date.now()-last>=86400000))throw new BadRequestException('Fuera de la ventana de 24 horas. Elige una plantilla aprobada.');
      let media;
      if(input.media_id){
        const result=await this.db.query('select provider_media_id,filename,mime_type from contact_media where company_id=$1 and lead_id=$2 and id=$3',[companyId,leadId,input.media_id]);
        if(!result.rowCount)throw new NotFoundException('Archivo no encontrado');
        media={id:result.rows[0].provider_media_id,filename:result.rows[0].filename,mime_type:result.rows[0].mime_type};
      }
      const hash=createHash('sha256').update(JSON.stringify({text:input.text||'',media_id:input.media_id||'',template_name:input.template_name||'',language:input.language||'',parameters:input.parameters||[]})).digest('hex');
      const claim=await this.db.query(`insert into contact_outbound_requests(id,company_id,lead_id,actor_id,payload_hash) values($1,$2,$3,$4,$5) on conflict(id) do nothing returning id`,[input.request_id,companyId,leadId,user.sub,hash]);
      if(!claim.rowCount){
        const existing=await this.db.query('select status,payload_hash,provider_message_id from contact_outbound_requests where id=$1 and company_id=$2 and lead_id=$3 and actor_id=$4',[input.request_id,companyId,leadId,user.sub]);
        if(existing.rows[0]?.payload_hash!==hash)throw new ConflictException('Identificador de envío ya utilizado.');
        if(existing.rows[0]?.status==='sent')return {provider_message_id:existing.rows[0].provider_message_id,duplicate:true};
        throw new ConflictException('El envío anterior aún no está confirmado. Revisa el historial antes de repetirlo.');
      }
      try{
        const result=await this.whatsapp.sendOperator(companyId,lead.whatsapp_number,{...input,media},user.email);
        await this.db.query("update contact_outbound_requests set status='sent',provider_message_id=$2 where id=$1",[input.request_id,result.provider_message_id]);
        await this.audit.record({companyId,actorType:'admin_user',actorId:user.sub,action:'contact.message_sent',resourceType:'lead',resourceId:leadId,metadata:{provider_message_id:result.provider_message_id}});
        return result;
      }catch(error){
        await this.db.query("update contact_outbound_requests set status='uncertain' where id=$1 and status='pending'",[input.request_id]);
        throw error;
      }
    });
  }
  async upload(companyId:string,leadId:string,user:AuthTokenPayload,file:{buffer:Buffer;originalname:string;mimetype:string}){
    if(!file)throw new BadRequestException('Selecciona un archivo.');
    const conversation=await this.conversation(companyId,leadId);
    const attention=await this.control.get(companyId,conversation.id);
    if(attention.mode!=='human'||attention.assignee_id!==user.sub)throw new ConflictException('Toma la conversación para adjuntar archivos.');
    const providerId=await this.whatsapp.uploadMedia(companyId,file);
    const filename=file.originalname.replace(/[\r\n\x00-\x1f]/g,'').slice(0,200)||'Archivo';
    return (await this.db.query('insert into contact_media(company_id,lead_id,provider_media_id,filename,mime_type) values($1,$2,$3,$4,$5) returning id,filename,mime_type',[companyId,leadId,providerId,filename,file.mimetype])).rows[0];
  }
  async download(companyId:string,leadId:string,conversationId:string,messageId:string){
    await this.conversation(companyId,leadId,conversationId);
    // Message ID is looked up in tenant storage; arbitrary provider media IDs are never accepted.
    const attachment=await this.messages.attachment(companyId,conversationId,messageId);
    if(!attachment)throw new NotFoundException('Archivo no encontrado');
    const buffer=await this.whatsapp.downloadMedia(companyId,attachment.id);
    return {buffer,filename:attachment.filename||'Archivo',mime_type:attachment.mime_type||'application/octet-stream'};
  }
  async schedule(companyId:string,leadId:string,user:AuthTokenPayload,input:{message:string;scheduled_at:string}){
    const lead=await this.lead(companyId,leadId);const conversation=await this.conversation(companyId,leadId);
    if(typeof input.message!=='string'||!input.message.trim()||input.message.length>2000||!Number.isFinite(Date.parse(input.scheduled_at))||Date.parse(input.scheduled_at)<=Date.now())throw new BadRequestException('Indica el mensaje y una fecha futura.');
    const result=await this.followups.schedule({company_id:companyId,lead_id:leadId,conversation_id:conversation.id,recipient:lead.whatsapp_number,message:input.message.trim(),scheduled_at:input.scheduled_at,reason:'Seguimiento programado por asesor'});
    await this.audit.record({companyId,actorType:'admin_user',actorId:user.sub,action:'contact.followup_scheduled',resourceType:'lead',resourceId:leadId});
    return result;
  }
  async calendars(companyId:string,leadId:string){
    await this.lead(companyId,leadId);
    try{return await this.google.listCalendars(companyId);}catch{throw new ServiceUnavailableException('No se pudieron consultar los calendarios conectados.');}
  }
  async meetingLink(companyId:string,leadId:string,meetingId:string){
    await this.lead(companyId,leadId);
    const result=await this.db.query('select calendar_id,provider_event_id from meetings where company_id=$1 and lead_id=$2 and id=$3',[companyId,leadId,meetingId]);
    if(!result.rowCount)throw new NotFoundException('Reunión no encontrada');
    try{
      const link=await this.google.meetingLink(companyId,result.rows[0].calendar_id,result.rows[0].provider_event_id);
      if(link.meet_link)await this.db.query('update meetings set raw_response=$4::jsonb,updated_at=now() where company_id=$1 and lead_id=$2 and id=$3',[companyId,leadId,meetingId,JSON.stringify(link.raw)]);
      return {meet_link:link.meet_link,pending:!link.meet_link};
    }catch{throw new ServiceUnavailableException('Google aún no confirmó el enlace de esta reunión.');}
  }
  async meeting(companyId:string,leadId:string,user:AuthTokenPayload,input:{start_time:string;duration:number;calendar_id:string;email:string;request_id:string}){
    const lead=await this.lead(companyId,leadId);const conversation=await this.conversation(companyId,leadId);
    const detail=await this.detail(companyId,leadId);
    if(!detail.calendar.enabled||!detail.calendar.connected)throw new BadRequestException('La agenda de esta empresa aún no está disponible. Puedes coordinarla manualmente y dejar una nota.');
    const start=Date.parse(input.start_time);const duration=Number(input.duration);
    if(!Number.isFinite(start)||start<=Date.now()||![15,30,45,60,90,120].includes(duration)||!/^\S+@\S+\.\S+$/.test(input.email||'')||!/^[a-f0-9-]{36}$/i.test(input.request_id||''))throw new BadRequestException('Revisa la fecha, duración y correo de la reunión.');
    const calendars=await this.calendars(companyId,leadId);
    if(!calendars.some(item=>item.id===input.calendar_id))throw new ForbiddenException('Calendario no disponible para esta empresa.');
    let result;
    try{result=await this.calendar.createMeeting({company_id:companyId,lead_id:leadId,conversation_id:conversation.id,title:`Reunión con ${lead.name||lead.whatsapp_number}`,start_time:new Date(start).toISOString(),end_time:new Date(start+duration*60000).toISOString(),timezone:detail.calendar.timezone,attendee_email:input.email,attendee_name:lead.name||undefined,attendee_phone:lead.whatsapp_number,idempotency_key:`contact:${leadId}:${input.request_id}`,calendar_id:input.calendar_id,create_meet:true});}
    catch(error){
      if(error instanceof BadRequestException)throw new BadRequestException(error.message.includes('busy')?'Ese horario está ocupado. Elige otra hora.':'Revisa los datos de la reunión.');
      throw new ServiceUnavailableException('No recibimos confirmación de la agenda. Revisa las reuniones antes de reintentar.');
    }
    await this.opportunities.changeStage(companyId,await this.opportunity(companyId,leadId),'reunion_agendada',user.sub);
    await this.audit.record({companyId,actorType:'admin_user',actorId:user.sub,action:'contact.meeting_booked',resourceType:'lead',resourceId:leadId,metadata:{meeting_id:result.id}});
    return result;
  }
}
