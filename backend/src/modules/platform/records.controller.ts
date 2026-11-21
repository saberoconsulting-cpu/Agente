import { BadRequestException, Body, ConflictException, Controller, Delete, ForbiddenException, NotFoundException, Param } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CurrentUser } from '../security/current-user.decorator';
import { Roles } from '../security/roles.decorator';
import { AuthTokenPayload } from '../auth/token';
import { PlatformService } from './platform.service';

@Controller('records')
export class RecordsController {
  constructor(private readonly db: DatabaseService, private readonly platform: PlatformService) {}

  @Delete(':resource/:id')
  @Roles('owner', 'admin')
  async remove(@CurrentUser() user: AuthTokenPayload, @Param('resource') resource: string, @Param('id') id: string, @Body() body?: { reason?: unknown }) {
    if (['companies', 'requests'].includes(resource)) return this.platform.removeRecord(user, resource, id);
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id)) throw new BadRequestException('Registro inválido.');
    if (['users', 'services', 'policies'].includes(resource) && user.role !== 'owner') throw new ForbiddenException('Solo el propietario puede eliminar este registro.');
    const tables: Record<string, string> = { contacts: 'leads', opportunities: 'opportunities', services: 'company_services', policies: 'negotiation_policies' };
    try {
      let result;
      if (resource === 'contacts') {
        const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
        if (!reason || reason.length > 1000) throw new BadRequestException('Indica el motivo de eliminación (máximo 1000 caracteres).');
        result = await this.db.query(`with removed as (
          update leads set status='deleted',updated_at=now() where company_id=$1 and id=$2 and status<>'deleted' returning id,whatsapp_number,name
        ), cancelled as (
          update followups set status='cancelled',updated_at=now() where company_id=$1 and status='scheduled'
          and (lead_id in(select id from removed) or recipient in(select whatsapp_number from removed)) returning id
        ), audited as (
          insert into audit_logs(company_id,actor_type,actor_id,action,resource_type,resource_id,metadata)
          select $1,'admin_user',$3,'contact.deleted','lead',id::text,
            jsonb_build_object('reason',$4::text,'actor_email',$5::text,'contact_name',name,'whatsapp_number',whatsapp_number)
          from removed returning resource_id
        ) select id from removed where id::text in(select resource_id from audited)`, [user.company_id, id, user.sub, reason, user.email]);
      } else if (resource === 'users') {
        if (id === user.sub) throw new ConflictException('No puedes eliminar tu propio acceso.');
        result = await this.db.query(`with removed as (
          update admin_users set active=false,updated_at=now() where company_id=$1 and id=$2 and role<>'owner' and active returning id
        ), sessions as (update auth_sessions set revoked_at=now() where user_id in(select id from removed)) select id from removed`, [user.company_id, id]);
      } else if (resource === 'files') {
        result = await this.db.conversationLock(user.company_id, `drive-file:${id}`, () => this.db.query(`with removed as (
          update google_drive_files set trashed=true,sync_status='deleted',updated_at=now() where company_id=$1 and id=$2 and not trashed returning id,google_file_id
        ), target_documents as materialized (
          select id from knowledge_documents where company_id=$1 and source_type='google_drive' and source_id in(select google_file_id from removed)
        ), target_chunks as materialized (
          select id from knowledge_chunks where company_id=$1 and document_id in(select id from target_documents)
        ), purged_references as (
          delete from knowledge_references where company_id=$1 and (
            document_id in(select id from target_documents) or chunk_id in(select id from target_chunks)
          ) returning id
        ), purged_embeddings as (
          delete from knowledge_embeddings where company_id=$1 and chunk_id in(select id from target_chunks) and (select count(*) from purged_references)>=0 returning id
        ), purged_chunks as (
          delete from knowledge_chunks where company_id=$1 and id in(select id from target_chunks) and (select count(*) from purged_embeddings)>=0 returning id
        ), documents as (
          delete from knowledge_documents where company_id=$1 and id in(select id from target_documents) and (select count(*) from purged_chunks)>=0
        ), queued as (
          delete from job_queue where company_id=$1 and job_type='drive.sync' and status in ('pending','dead','completed') and payload->>'file_id' in(select id::text from removed)
        ) select id from removed`, [user.company_id, id]));
      } else if (tables[resource]) {
        // Table names come exclusively from this allowlist. Tenant and record are always parameters.
        result = await this.db.query(`delete from ${tables[resource]} where company_id=$1 and id=$2 returning id`, [user.company_id, id]);
      } else throw new BadRequestException('Lista no disponible.');
      if (!result.rowCount) throw new NotFoundException('Registro no disponible o protegido.');
      return { removed: true };
    } catch (error) {
      if ((error as {code?: string}).code === '23503') throw new ConflictException('Este registro tiene conversaciones u otros datos vinculados. No se puede eliminar sin revisar su historial.');
      throw error;
    }
  }
}
