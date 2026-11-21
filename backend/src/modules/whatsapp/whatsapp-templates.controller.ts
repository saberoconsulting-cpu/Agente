import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Put, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthTokenPayload } from '../auth/token';
import { CurrentUser, TenantId } from '../security/current-user.decorator';
import { Roles } from '../security/roles.decorator';
import { CreateTemplateInput, TemplateImage, WhatsappTemplatesService } from './whatsapp-templates.service';

@Controller('whatsapp/templates')
export class WhatsappTemplatesController {
  constructor(private readonly templates: WhatsappTemplatesService) {}

  @Get() @Roles('owner', 'admin')
  list(@TenantId() companyId: string) { return this.templates.list(companyId); }

  /** multipart: campo `payload` (JSON de la plantilla) y, opcional, `image`. */
  @Post() @Roles('owner', 'admin')
  @UseInterceptors(FileInterceptor('image', { limits: { fileSize: 5 * 1024 * 1024 } }))
  create(
    @TenantId() companyId: string,
    @CurrentUser() user: AuthTokenPayload,
    @Body() body: { payload?: string },
    @UploadedFile() image?: TemplateImage,
  ) {
    let input: CreateTemplateInput;
    try { input = JSON.parse(String(body?.payload || '')); } catch { throw new BadRequestException('Datos de plantilla no válidos.'); }
    return this.templates.create(companyId, user.sub, input, image);
  }

  /** multipart igual que al crear. Meta solo permite editar plantillas aprobadas, rechazadas o pausadas. */
  @Put(':id') @Roles('owner', 'admin')
  @UseInterceptors(FileInterceptor('image', { limits: { fileSize: 5 * 1024 * 1024 } }))
  update(
    @TenantId() companyId: string,
    @CurrentUser() user: AuthTokenPayload,
    @Param('id') id: string,
    @Body() body: { payload?: string },
    @UploadedFile() image?: TemplateImage,
  ) {
    let input: CreateTemplateInput;
    try { input = JSON.parse(String(body?.payload || '')); } catch { throw new BadRequestException('Datos de plantilla no válidos.'); }
    return this.templates.update(companyId, user.sub, id, input, image);
  }

  @Delete(':name') @Roles('owner', 'admin')
  remove(@TenantId() companyId: string, @CurrentUser() user: AuthTokenPayload, @Param('name') name: string) {
    return this.templates.remove(companyId, user.sub, name);
  }
}
