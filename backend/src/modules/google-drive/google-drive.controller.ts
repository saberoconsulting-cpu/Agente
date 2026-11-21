import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { GoogleDriveService, RegisterDriveFileInput } from './google-drive.service';
import { Roles } from '../security/roles.decorator';
import { TenantId } from '../security/current-user.decorator';
import { QueueService } from '../queue/queue.service';

@Controller('google-drive')
export class GoogleDriveController {
  constructor(private readonly drive: GoogleDriveService, private readonly queue: QueueService) {}

  @Post('files')
  @Roles('owner', 'admin')
  registerFile(@TenantId() companyId: string, @Body() body: RegisterDriveFileInput) {
    // La empresa sale de la sesión; nunca de lo que envía el navegador.
    return this.drive.registerAuthorizedFile({ ...body, company_id: companyId });
  }

  @Get('files')
  listFiles(@TenantId() companyId: string) {
    return this.drive.listAuthorizedFiles(companyId);
  }

  @Post('files/:id/sync')
  @Roles('owner', 'admin')
  async syncFile(@Param('id') id: string, @TenantId() companyId: string) {
    await this.queue.enqueue('drive.sync', companyId, { file_id: id }, new Date(), `drive-file:${id}`);
    return { accepted: true };
  }

  @Post('sync')
  @Roles('owner', 'admin')
  async syncChanged(@TenantId() companyId: string) {
    await this.queue.enqueue('drive.sync', companyId, {}, new Date(), 'drive-sync');
    return { accepted: true };
  }

  @Post('sync/all')
  @Roles('owner')
  async syncAll(@TenantId() companyId: string) {
    await this.queue.enqueue('drive.sync', companyId, {}, new Date(), 'drive-sync');
    return { accepted: true };
  }
}
