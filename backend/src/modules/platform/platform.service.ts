import { BadRequestException, ForbiddenException, Injectable, Logger, OnModuleDestroy, OnModuleInit, ServiceUnavailableException, HttpException } from '@nestjs/common';
import { hashPassword } from '../auth/password';
import {accessRequestPhone} from './access-request-phone';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { DatabaseService } from '../database/database.service';
import { AuthTokenPayload } from '../auth/token';

@Injectable()
export class PlatformService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PlatformService.name);
  private timer?: ReturnType<typeof setInterval>;
  private syncing = false;
  constructor(private readonly config: ConfigService, private readonly db: DatabaseService) {}
  get managed() { return this.config.get<string>('PLATFORM_MANAGED') === 'true'; }
  get mongo() { return this.config.get<string>('MESSAGING_STORE') === 'mongo'; }

  isAdministrator(user: AuthTokenPayload) {
    const emails = (this.config.get<string>('PLATFORM_ADMIN_EMAILS') || '').split(',').map(value => value.trim().toLowerCase()).filter(Boolean);
    return user.company_id === this.config.get<string>('PLATFORM_ADMIN_COMPANY_ID')
      && user.role === 'owner' && emails.includes(user.email.toLowerCase());
  }

  async companies(user: AuthTokenPayload) {
    if (!this.isAdministrator(user)) throw new ForbiddenException('Platform administrator required');
    const token = this.config.get<string>('PLATFORM_ADMIN_TOKEN');
    if (!token || token.length < 32) throw new ServiceUnavailableException('Platform administration is not configured');
    try {
      return (await axios.get(`${this.config.get<string>('PLATFORM_API_URL')}/v1/admin/companies`, {
        headers: { Authorization: `Bearer ${token}` }, timeout: 30000,
      })).data;
    } catch { throw new ServiceUnavailableException('Company overview temporarily unavailable'); }
  }

  async companyAccess(user:AuthTokenPayload,id:string,body:Record<string,unknown>){
    if(!this.isAdministrator(user))throw new ForbiddenException('Platform administrator required');
    if(id===this.config.get<string>('PLATFORM_ADMIN_COMPANY_ID'))throw new ForbiddenException('La cuenta administradora está protegida.');
    if(!/^[a-z0-9][a-z0-9-]{0,62}$/.test(id)||!['enable','suspend'].includes(String(body.action))||body.confirmed!==true)throw new BadRequestException('Confirma la acción para esta empresa.');
    const token=this.config.get<string>('PLATFORM_ADMIN_TOKEN');
    if(!token||token.length<32)throw new ServiceUnavailableException('Platform administration is not configured');
    try{return(await axios.post(`${this.config.get<string>('PLATFORM_API_URL')}/v1/admin/companies/${id}/access`,{action:body.action,confirmed:true},{headers:{Authorization:`Bearer ${token}`},timeout:15000})).data;}
    catch(error){if(axios.isAxiosError(error)&&[400,403,404,409].includes(error.response?.status||0))throw new HttpException('No se pudo cambiar el acceso. Actualiza la ficha y verifica que la empresa tenga agente y propietario habilitados.',error.response!.status);throw new ServiceUnavailableException('No se pudo actualizar el acceso. Vuelve a intentarlo.');}
  }

  async removeRecord(user: AuthTokenPayload, resource: string, id: string) {
    if (!this.isAdministrator(user)) throw new ForbiddenException('Platform administrator required');
    if (resource === 'companies' && id === user.company_id) throw new BadRequestException('No puedes eliminar la empresa administradora.');
    if (!(resource === 'companies' ? /^[a-z0-9][a-z0-9-]{0,62}$/ : /^[a-f0-9-]{36}$/i).test(id)) throw new BadRequestException('Registro inválido.');
    const token = this.config.get<string>('PLATFORM_ADMIN_TOKEN');
    if (!token || token.length < 32) throw new ServiceUnavailableException('Platform administration is not configured');
    try {
      return (await axios.delete(`${this.config.get<string>('PLATFORM_API_URL')}/v1/admin/${resource === 'companies' ? 'companies' : 'access-requests'}/${id}`, {headers: {Authorization: `Bearer ${token}`}, timeout: 15000})).data;
    } catch (error) {
      if (axios.isAxiosError(error) && [400,403,404,409].includes(error.response?.status || 0)) throw new HttpException('No se pudo eliminar el registro. Puede estar protegido o ya no existir.', error.response!.status);
      throw new ServiceUnavailableException('No se pudo completar la eliminación. Vuelve a intentarlo.');
    }
  }

  async accessRequest(body: Record<string, unknown>) {
    if (this.config.get<string>('PUBLIC_ACCESS_REQUESTS_ENABLED') !== 'true' || this.config.get<string>('COMPANY_ID') !== this.config.get<string>('PLATFORM_ADMIN_COMPANY_ID')) throw new ServiceUnavailableException('Las solicitudes no están disponibles en este momento.');
    const input: Record<string,string> = {};
    for (const [key,max] of [['business_name',150],['contact_name',120],['email',254],['phone',40]] as const) {
      if (typeof body[key] !== 'string' || !(body[key] as string).trim() || (body[key] as string).length > max) throw new BadRequestException('Completa empresa, nombre, correo y teléfono.');
      input[key] = (body[key] as string).trim();
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) throw new BadRequestException('Revisa el correo.');
    try {Object.assign(input,accessRequestPhone(input.phone,body.phone_country));}
    catch {throw new BadRequestException('Revisa el número de teléfono y el país elegido.');}
    if(typeof body.password!=='string'||body.password.length<12||body.password.length>128)throw new BadRequestException('Elige una contraseña de entre 12 y 128 caracteres.');
    input.password_hash=hashPassword(body.password);
    await this.request('POST','/v1/access-requests',input);
    return { received: true };
  }

  async accessRequests(user: AuthTokenPayload, id?: string, body?: Record<string,unknown>) {
    if (!this.isAdministrator(user)) throw new ForbiddenException('Platform administrator required');
    const token=this.config.get<string>('PLATFORM_ADMIN_TOKEN');
    if (!token || token.length<32) throw new ServiceUnavailableException('Platform administration is not configured');
    let data: Record<string,unknown> | undefined;
    if (id) {
      if (!/^[a-f0-9-]{36}$/i.test(id) || !['approve','reject','activate','retry_notification'].includes(String(body?.action))) throw new BadRequestException('Solicitud o acción inválida.');
      data={ action: body!.action, actor:user.email, payment_confirmed:body!.payment_confirmed, payment_reference:body!.payment_reference, company_id:body!.target_company_id, rejection_reason:body!.rejection_reason };
    }
    try {
      return (await axios.request({ method:id?'POST':'GET', url:`${this.config.get<string>('PLATFORM_API_URL')}/v1/admin/access-requests${id?`/${id}`:''}`, headers:{Authorization:`Bearer ${token}`}, data, timeout:15000 })).data;
    } catch(error) {
      if (axios.isAxiosError(error) && [400,404,409].includes(error.response?.status || 0)) throw new HttpException('No se pudo completar la acción. Verifica el pago, la empresa preparada y que el correo no tenga un acceso previo.',error.response!.status);
      throw new ServiceUnavailableException('No se pudo consultar la plataforma. Vuelve a intentarlo.');
    }
  }

  async onModuleInit() {
    if (!this.managed && !this.mongo) return;
    for (const key of ['COMPANY_ID', 'PLATFORM_API_URL', 'PLATFORM_SERVICE_TOKEN']) {
      if (!this.config.get<string>(key)) throw new Error(`${key} is required for platform integration`);
    }
    if (this.managed && !this.mongo) throw new Error('Managed agent requires MESSAGING_STORE=mongo');
    await this.company();
    if (this.managed) {
      this.timer = setInterval(() => void this.reconcile().catch(() => this.logger.warn('Contact sync pending; retrying next interval')), 60000);
      this.timer.unref();
      void this.reconcile().catch(() => this.logger.warn('Initial contact sync pending'));
    }
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  assertCompany(companyId: string) {
    if ((this.managed || this.mongo) && companyId !== this.config.get<string>('COMPANY_ID')) {
      throw new ForbiddenException('Company does not belong to this service');
    }
  }

  async request<T = any>(method: 'GET' | 'POST', path: string, data?: unknown): Promise<T> {
    const baseURL = this.config.get<string>('PLATFORM_API_URL');
    if (!baseURL) throw new Error('PLATFORM_API_URL is required');
    try {
      const response = await axios.request<T>({ method, baseURL, url: path, data, timeout: 10000,
        headers: { Authorization: `Bearer ${this.config.get<string>('PLATFORM_SERVICE_TOKEN')}`,
          'X-Company-Id': this.config.get<string>('COMPANY_ID') } });
      return response.data;
    } catch (error) {
      // Do not propagate Axios config: it contains internal service credentials.
      if (axios.isAxiosError(error) && error.response?.status === 403) throw new ForbiddenException('Company or product is disabled');
      throw new ServiceUnavailableException('Platform temporarily unavailable');
    }
  }

  async company() {
    const company = await this.request<{ id: string; products: string[] }>('GET', '/v1/company');
    if (company.id !== this.config.get<string>('COMPANY_ID') || !company.products.includes('agent')) throw new ForbiddenException('Agent is not enabled');
    return company;
  }

  async contact(companyId: string, externalId: string, phone: string, name?: string | null) {
    if (!this.managed) return;
    this.assertCompany(companyId);
    return this.request('POST', '/v1/contacts', { externalId, phone, name });
  }

  async reconcile() {
    if (!this.managed || this.syncing) return;
    this.syncing = true;
    try {
      await this.company();
      const companyId = this.config.get<string>('COMPANY_ID')!;
      const result = await this.db.query<{ id: string; whatsapp_number: string; name: string | null; version: string }>(
        `select l.id,l.whatsapp_number,l.name,o.version from platform.contact_outbox o join leads l on l.id::text=o.external_id
        where o.product='agent' and l.company_id=$1 order by l.id limit 100`, [companyId]);
      for (const lead of result.rows) {
        try {
          await this.contact(companyId, lead.id, lead.whatsapp_number, lead.name);
          await this.db.query("delete from platform.contact_outbox where product='agent' and external_id=$1 and version=$2", [lead.id, lead.version]);
        } catch { this.logger.warn('Contact publication pending; check contact identity and platform availability'); }
      }
      const page = await this.request<{ items: { id: string; version: string; phone?: string; name?: string; links?: { agent?: string } }[] }>('GET', '/v1/contact-inbox');
      for (const contact of page.items) {
        try {
          if (contact.phone) {
            if (contact.links?.agent) {
              await this.db.query(`update leads set whatsapp_number=$3,name=$4 where id=$1::uuid and company_id=$2
                and (whatsapp_number is distinct from $3 or name is distinct from $4)`, [contact.links.agent, companyId, contact.phone, contact.name || null]);
            } else {
              const result = await this.db.query<{ id: string }>(`insert into leads(company_id,whatsapp_number,name) values($1,$2,$3)
                on conflict(company_id,whatsapp_number) do update set name=excluded.name where leads.name is distinct from excluded.name returning id`, [companyId, contact.phone, contact.name || null]);
              const id = result.rows[0]?.id || (await this.db.query<{ id: string }>('select id from leads where company_id=$1 and whatsapp_number=$2', [companyId, contact.phone])).rows[0].id;
              await this.contact(companyId, id, contact.phone, contact.name);
            }
          }
          await this.request('POST', '/v1/contact-inbox/ack', { id: contact.id, version: contact.version });
        } catch { this.logger.warn('Contact import pending; check contact identity and platform availability'); }
      }
    } finally { this.syncing = false; }
  }
}
