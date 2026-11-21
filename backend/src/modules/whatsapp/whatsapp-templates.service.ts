import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ensureTemplateMediaTable } from './whatsapp-template-media';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { AuditService } from '../audit/audit.service';
import { DatabaseService } from '../database/database.service';
import { PlatformService } from '../platform/platform.service';
import { WhatsappConnectionsService } from './whatsapp-connections.service';

export type TemplateButtonInput = { type: 'QUICK_REPLY' | 'URL'; text: string; url?: string };
export type TemplateImage = { buffer: Buffer; originalname: string; mimetype: string };
export type CreateTemplateInput = {
  name?: string;
  language?: string;
  category?: string;
  header_type?: 'NONE' | 'TEXT' | 'IMAGE';
  header?: string;
  body?: string;
  footer?: string;
  examples?: string[];
  buttons?: TemplateButtonInput[];
};

const NAME = /^[a-z0-9_]{1,512}$/;
const LANGUAGE = /^[a-z]{2,3}(_[A-Z]{2})?$/;
const CATEGORIES = ['MARKETING', 'UTILITY'];
const SHORTENERS = /(^|\.)(bit\.ly|tinyurl\.com|t\.co|goo\.gl|ow\.ly|is\.gd|buff\.ly|rebrand\.ly|cutt\.ly|wa\.me)$/i;
const MAX_IMAGE = 5 * 1024 * 1024;

/** Detecta JPEG/PNG por su firma real, sin confiar en el tipo que declara el navegador. */
export function detectImage(buffer: Buffer): 'image/jpeg' | 'image/png' | null {
  if (buffer.length > 8 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.length > 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  return null;
}

@Injectable()
export class WhatsappTemplatesService {
  constructor(
    private readonly config: ConfigService,
    private readonly db: DatabaseService,
    private readonly connections: WhatsappConnectionsService,
    private readonly platform: PlatformService,
    private readonly audit: AuditService,
  ) {}

  /** Valida la plantilla y devuelve el payload exacto que acepta Meta. */
  buildPayload(input: CreateTemplateInput, headerHandle?: string) {
    const name = String(input.name || '').trim();
    if (!NAME.test(name)) throw new BadRequestException('El nombre solo puede tener minúsculas, números y guion bajo (ej. promo_noviembre).');
    const language = String(input.language || '').trim();
    if (!LANGUAGE.test(language)) throw new BadRequestException('Idioma no válido (ej. es, es_PE, en_US).');
    const category = String(input.category || '').toUpperCase();
    if (!CATEGORIES.includes(category)) throw new BadRequestException('La categoría debe ser Marketing o Utilidad.');

    const body = String(input.body || '').trim();
    if (!body) throw new BadRequestException('Escribe el texto del mensaje.');
    if (body.length > 1024) throw new BadRequestException('El mensaje admite hasta 1024 caracteres.');
    const indexes = [...body.matchAll(/\{\{(\d+)\}\}/g)].map((match) => Number(match[1]));
    const count = indexes.length ? Math.max(...indexes) : 0;
    const unique = new Set(indexes);
    for (let i = 1; i <= count; i += 1) {
      if (!unique.has(i)) throw new BadRequestException('Las variables deben ser consecutivas: {{1}}, {{2}}, {{3}}…');
    }
    if (/\{\{[^}]*\}\}/.test(body.replace(/\{\{\d+\}\}/g, ''))) throw new BadRequestException('Las variables solo pueden ser números, como {{1}}.');
    if (count && (/^\s*\{\{\d+\}\}/.test(body) || /\{\{\d+\}\}\s*$/.test(body))) {
      throw new BadRequestException('Meta no permite empezar ni terminar el mensaje con una variable. Agrega texto antes y después.');
    }
    if (/\{\{\d+\}\}\s*\{\{\d+\}\}/.test(body)) throw new BadRequestException('No pongas dos variables seguidas. Sepáralas con texto.');
    if (count > 10 || body.length < count * 8) throw new BadRequestException('Hay demasiadas variables para el largo del mensaje.');
    const examples = (input.examples || []).map((item) => String(item ?? '').trim());
    if (examples.length !== count || examples.some((item) => !item || item.length > 200)) {
      throw new BadRequestException('Escribe un ejemplo para cada variable. Meta lo usa para aprobar la plantilla.');
    }

    const components: Record<string, unknown>[] = [];
    const headerType = input.header_type || (String(input.header || '').trim() ? 'TEXT' : 'NONE');
    if (!['NONE', 'TEXT', 'IMAGE'].includes(headerType)) throw new BadRequestException('Tipo de encabezado no válido.');
    if (headerType === 'IMAGE') {
      if (!headerHandle) throw new BadRequestException('Agrega la imagen del encabezado (JPG o PNG de hasta 5 MB).');
      components.push({ type: 'HEADER', format: 'IMAGE', example: { header_handle: [headerHandle] } });
    }
    if (headerType === 'TEXT') {
      const header = String(input.header || '').trim();
      if (!header) throw new BadRequestException('Escribe el texto del encabezado o elige otro tipo.');
      if (header.length > 60) throw new BadRequestException('El encabezado admite hasta 60 caracteres.');
      if (/\{\{/.test(header)) throw new BadRequestException('El encabezado no admite variables.');
      components.push({ type: 'HEADER', format: 'TEXT', text: header });
    }
    components.push({ type: 'BODY', text: body, ...(count ? { example: { body_text: [examples] } } : {}) });
    const footer = String(input.footer || '').trim();
    if (footer) {
      if (footer.length > 60) throw new BadRequestException('El pie admite hasta 60 caracteres.');
      if (/\{\{/.test(footer)) throw new BadRequestException('El pie no admite variables.');
      components.push({ type: 'FOOTER', text: footer });
    }
    const buttons = input.buttons || [];
    if (buttons.length > 3) throw new BadRequestException('Puedes agregar hasta 3 botones.');
    if (buttons.filter((item) => item.type === 'URL').length > 2) throw new BadRequestException('Solo se permiten 2 botones con enlace.');
    if (buttons.length) {
      components.push({
        type: 'BUTTONS',
        buttons: buttons.map((button) => {
          const text = String(button.text || '').trim();
          if (!text || text.length > 25) throw new BadRequestException('El texto de cada botón admite de 1 a 25 caracteres.');
          if (button.type === 'QUICK_REPLY') return { type: 'QUICK_REPLY', text };
          if (button.type === 'URL') {
            let url: URL;
            try { url = new URL(String(button.url || '')); } catch { throw new BadRequestException('El enlace del botón no es válido.'); }
            if (url.protocol !== 'https:' || /\{\{/.test(String(button.url))) throw new BadRequestException('El enlace del botón debe empezar con https://.');
            if (SHORTENERS.test(url.hostname)) throw new BadRequestException('Meta rechaza enlaces acortados (bit.ly, wa.me…). Usa el enlace completo de tu sitio.');
            return { type: 'URL', text, url: url.toString() };
          }
          throw new BadRequestException('Tipo de botón no válido.');
        }),
      });
    }
    return { name, language, category, components };
  }

  async list(companyId: string) {
    const { waba, token } = await this.credentials(companyId);
    let templates: any[];
    try {
      const response = await axios.get(`https://graph.facebook.com/${this.version()}/${waba}/message_templates`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { fields: 'id,name,status,language,category,components,rejected_reason', limit: 100 },
        timeout: 20000,
      });
      templates = response.data?.data || [];
    } catch (error) {
      throw new ServiceUnavailableException(this.metaMessage(error, 'No se pudieron consultar las plantillas de WhatsApp.'));
    }
    const withImage = await this.storedImages(companyId);
    return templates.map((item: any) => ({
      id: String(item.id),
      name: item.name,
      language: item.language,
      category: item.category,
      status: item.status,
      rejected_reason: item.rejected_reason && item.rejected_reason !== 'NONE' ? item.rejected_reason : null,
      has_image: withImage.has(`${item.name}:${item.language}`),
      components: (item.components || []).map((component: any) => (component.type === 'HEADER' && component.format === 'IMAGE' ? { type: 'HEADER', format: 'IMAGE' } : component)),
    }));
  }

  /** Names of templates with a saved header image. A local database problem must never hide Meta's templates. */
  private async storedImages(companyId: string) {
    try {
      await ensureTemplateMediaTable(this.db);
      const stored = await this.db.query<{ template_name: string; language: string }>(
        'select template_name, language from whatsapp_template_media where company_id=$1', [companyId]);
      return new Set(stored.rows.map((row) => `${row.template_name}:${row.language}`));
    } catch (error) {
      this.logger.warn(`Template image lookup failed (database): ${error instanceof Error ? error.message.slice(0, 160) : 'unknown error'}`);
      return new Set<string>();
    }
  }

  async create(companyId: string, actorId: string, input: CreateTemplateInput, image?: TemplateImage) {
    if (input.header_type !== 'IMAGE' && image) throw new BadRequestException('Elige "Imagen" como encabezado para usar una imagen.');
    // Valida todo el contenido antes de subir nada a Meta.
    this.buildPayload(input, input.header_type === 'IMAGE' ? 'pending' : undefined);
    const { waba, token, appId } = await this.credentials(companyId);
    let handle: string | undefined;
    if (input.header_type === 'IMAGE') {
      this.assertImage(image);
      handle = await this.uploadSample(appId, token, image!);
    }
    const payload = this.buildPayload(input, handle);
    let data: any;
    try {
      data = (await axios.post(`https://graph.facebook.com/${this.version()}/${waba}/message_templates`, payload, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 20000,
      })).data;
    } catch (error) {
      throw new BadRequestException(this.metaMessage(error, 'Meta no aceptó la plantilla. Revisa el contenido e inténtalo de nuevo.'));
    }
    if (input.header_type === 'IMAGE' && image) {
      await ensureTemplateMediaTable(this.db);
      await this.db.query(
        `insert into whatsapp_template_media(company_id,template_name,language,mime_type,data) values($1,$2,$3,$4,$5)
         on conflict(company_id,template_name,language) do update set mime_type=excluded.mime_type,data=excluded.data,created_at=now()`,
        [companyId, payload.name, payload.language, detectImage(image.buffer), image.buffer],
      );
    }
    await this.audit.record({
      companyId, actorType: 'admin_user', actorId, action: 'whatsapp.template_created',
      resourceType: 'whatsapp_template', resourceId: String(data?.id || payload.name),
      metadata: { name: payload.name, language: payload.language, category: payload.category, status: data?.status, header: input.header_type || 'NONE' },
    });
    return { id: data?.id ? String(data.id) : null, name: payload.name, language: payload.language, status: data?.status || 'PENDING', category: data?.category || payload.category };
  }

  /** Edits an existing template in Meta (name, language and category cannot change). Meta reviews it again afterwards. */
  async update(companyId: string, actorId: string, id: string, input: CreateTemplateInput, image?: TemplateImage) {
    if (!/^\d{5,30}$/.test(id || '')) throw new BadRequestException('Plantilla no válida.');
    if (input.header_type !== 'IMAGE' && image) throw new BadRequestException('Elige "Imagen" como encabezado para usar una imagen.');
    this.buildPayload(input, input.header_type === 'IMAGE' ? 'pending' : undefined);
    const { token, appId } = await this.credentials(companyId);
    let handle: string | undefined;
    if (input.header_type === 'IMAGE') {
      this.assertImage(image);
      handle = await this.uploadSample(appId, token, image!);
    }
    const payload = this.buildPayload(input, handle);
    try {
      await axios.post(`https://graph.facebook.com/${this.version()}/${id}`, { components: payload.components }, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 20000,
      });
    } catch (error) {
      throw new BadRequestException(this.metaMessage(error, 'Meta no aceptó los cambios. Revisa el contenido e inténtalo de nuevo. Meta limita las ediciones a una cada 24 horas por plantilla aprobada.'));
    }
    if (input.header_type === 'IMAGE' && image) {
      await ensureTemplateMediaTable(this.db);
      await this.db.query(
        `insert into whatsapp_template_media(company_id,template_name,language,mime_type,data) values($1,$2,$3,$4,$5)
         on conflict(company_id,template_name,language) do update set mime_type=excluded.mime_type,data=excluded.data,created_at=now()`,
        [companyId, payload.name, payload.language, detectImage(image.buffer), image.buffer],
      );
    }
    await this.audit.record({
      companyId, actorType: 'admin_user', actorId, action: 'whatsapp.template_updated',
      resourceType: 'whatsapp_template', resourceId: id,
      metadata: { name: payload.name, language: payload.language, header: input.header_type || 'NONE' },
    });
    return { id, name: payload.name, language: payload.language, status: 'PENDING' };
  }

  async remove(companyId: string, actorId: string, name: string) {
    if (!NAME.test(name || '')) throw new BadRequestException('Plantilla no válida.');
    const { waba, token } = await this.credentials(companyId);
    try {
      await axios.delete(`https://graph.facebook.com/${this.version()}/${waba}/message_templates`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { name },
        timeout: 15000,
      });
    } catch (error) {
      throw new BadRequestException(this.metaMessage(error, 'No se pudo eliminar la plantilla.'));
    }
    await ensureTemplateMediaTable(this.db).catch(() => undefined);
    await this.db.query('delete from whatsapp_template_media where company_id=$1 and template_name=$2', [companyId, name]).catch(() => undefined);
    await this.audit.record({ companyId, actorType: 'admin_user', actorId, action: 'whatsapp.template_deleted', resourceType: 'whatsapp_template', resourceId: name });
    return { ok: true };
  }

  private assertImage(image?: TemplateImage) {
    if (!image?.buffer?.length) throw new BadRequestException('Agrega la imagen del encabezado (JPG o PNG de hasta 5 MB).');
    if (image.buffer.length > MAX_IMAGE) throw new BadRequestException('La imagen admite hasta 5 MB.');
    if (!detectImage(image.buffer)) throw new BadRequestException('La imagen debe ser JPG o PNG.');
  }

  /** Resumable Upload de Meta: devuelve el handle que se usa como ejemplo del encabezado. */
  private async uploadSample(appId: string, token: string, image: TemplateImage) {
    if (!appId) throw new BadRequestException('Falta el identificador de la app de Meta para subir la imagen.');
    const mime = detectImage(image.buffer)!;
    try {
      const session = await axios.post(`https://graph.facebook.com/${this.version()}/${appId}/uploads`, null, {
        headers: { Authorization: `Bearer ${token}` },
        params: { file_length: image.buffer.length, file_type: mime, file_name: mime === 'image/png' ? 'header.png' : 'header.jpg' },
        timeout: 15000,
      });
      const uploaded = await axios.post(`https://graph.facebook.com/${this.version()}/${session.data.id}`, image.buffer, {
        headers: { Authorization: `OAuth ${token}`, file_offset: '0', 'Content-Type': 'application/octet-stream' },
        maxBodyLength: Infinity,
        timeout: 30000,
      });
      if (!uploaded.data?.h) throw new Error('missing handle');
      return String(uploaded.data.h);
    } catch (error) {
      throw new ServiceUnavailableException(this.metaMessage(error, 'Meta no pudo recibir la imagen de ejemplo. Inténtalo de nuevo.'));
    }
  }

  private async credentials(companyId: string) {
    this.platform.assertCompany(companyId);
    const connection = await this.connections.findActiveForCompany(companyId);
    if (!connection && !this.connections.serverNumberAllowed(companyId)) throw new BadRequestException('Conecta primero tu número de WhatsApp para gestionar plantillas.');
    const waba = connection?.waba_id ||this.config.get<string>('META_WABA_ID');
    const token = connection
      ? this.connections.decryptAccessToken(connection)
      : this.config.get<string>('META_ACCESS_TOKEN') || this.config.get<string>('WHATSAPP_ACCESS_TOKEN') || this.config.get<string>('WHATSAPP_TOKEN');
    if (!waba || !token) throw new BadRequestException('Conecta primero tu número de WhatsApp para gestionar plantillas.');
    const appId = connection?.meta_app_id || this.config.get<string>('META_APP_ID') || '';
    return { waba, token, appId };
  }

  private readonly logger = new Logger(WhatsappTemplatesService.name);

  private metaMessage(error: unknown, fallback: string) {
    const failure = error as { response?: { status?: number; data?: { error?: { code?: number; error_subcode?: number; message?: string; error_user_msg?: string; error_user_title?: string } } }; code?: string };
    const meta = failure?.response?.data?.error;
    // Log the real cause for diagnosis (Meta messages never include the access token).
    this.logger.warn(`Meta template request failed: http=${failure?.response?.status ?? 'none'} code=${meta?.code ?? failure?.code ?? 'n/a'} subcode=${meta?.error_subcode ?? 'n/a'} message=${String(meta?.message ?? '').slice(0, 200)}`);
    const detail = meta?.error_user_msg || meta?.error_user_title;
    if (detail) return `${fallback} Meta indica: ${String(detail).slice(0, 300)}`;
    if (meta?.code === 190) return `${fallback} El acceso de WhatsApp venció o fue revocado. Reconecta WhatsApp en Conexiones.`;
    if (meta?.code === 10 || meta?.code === 200 || meta?.code === 3) return `${fallback} A la conexión de WhatsApp le falta el permiso para gestionar plantillas. Reconéctala en Conexiones y acepta todos los permisos.`;
    if (meta?.code === 100) return `${fallback} Meta no reconoce la cuenta de WhatsApp Business conectada. Reconecta WhatsApp en Conexiones.`;
    if (meta?.code === 4 || meta?.code === 17 || meta?.code === 32 || meta?.code === 613) return `${fallback} Meta recibió demasiadas consultas. Espera unos minutos e inténtalo de nuevo.`;
    if (!failure?.response && (axios.isAxiosError(error) || failure?.code)) return `${fallback} Meta no respondió a tiempo. Inténtalo de nuevo en un momento.`;
    return fallback;
  }

  private version() { return this.config.get<string>('META_GRAPH_API_VERSION') || 'v25.0'; }
}
