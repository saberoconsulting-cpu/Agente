import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { GoogleDriveService, RegisterDriveFileInput } from './google-drive.service';

@Controller('google-drive')
export class GoogleDriveController {
  constructor(private readonly drive: GoogleDriveService) {}

  @Post('files')
  registerFile(@Body() body: RegisterDriveFileInput) {
    return this.drive.registerAuthorizedFile({
      ...body,
      company_id: body.company_id || 'sabero',
    });
  }

  @Get('files')
  listFiles(@Query('company_id') companyId = 'sabero') {
    return this.drive.listAuthorizedFiles(companyId);
  }

  @Post('files/:id/sync')
  syncFile(@Param('id') id: string, @Query('company_id') companyId = 'sabero') {
    return this.drive.syncAuthorizedFile(companyId, id);
  }

  @Post('sync')
  syncChanged(@Query('company_id') companyId = 'sabero') {
    return this.drive.syncChangedFiles(companyId);
  }

  @Post('sync/all')
  syncAll() {
    return this.drive.syncAllCompanies();
  }
}
