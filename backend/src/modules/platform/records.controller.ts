import { BadRequestException, ConflictException, Controller, Delete, ForbiddenException, NotFoundException, Param } from '@nestjs/common';
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
  async remove(@CurrentUser() user: AuthTokenPayload, @Param('resource') resource: string, @Param('id') id: string) {
    if (['companies', 'requests'].includes(resource)) return this.platform.removeRecord(user, resource, id);
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id)) throw new BadRequestException('Registro inválido.');
    if (['users', 'services', 'policies'].includes(resource) && user.role !== 'owner') throw new ForbiddenException('Solo el propietario puede eliminar este registro.');
    const tables: Record<string, string> = { contacts: 'leads', opportunities: 'opportunities', services: 'company_services', policies: 'negotiation_policies' };
    try {
      let result;
      if (resource === 'users') {
        if (id === user.sub) throw new ConflictException('No puedes eliminar tu propio acceso.');
        result = await this.db.query(`with removed as (
          update admin_users set active=false,updated_at=now() where company_id=$1 and id=$2 and role<>'owner' and active returning id
        ), sessions as (update auth_sessions set revoked_at=now() where user_id in(select id from removed)) select id from removed`, [user.company_id, id]);
      } else if (resource === 'files') {
        result = await this.db.query(`with removed as (
          update google_drive_files set trashed=true,sync_status='deleted',updated_at=now() where company_id=$1 and id=$2 and not trashed returning id,google_file_id
        ), documents as (update knowledge_documents set status='deleted',updated_at=now() where company_id=$1 and source_type='google_drive' and source_id in(select google_file_id from removed)) select id from removed`, [user.company_id, id]);
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
