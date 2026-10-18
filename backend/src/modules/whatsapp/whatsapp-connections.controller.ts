import { Body, Controller, Delete, Get, Headers, Param, Post } from '@nestjs/common';
import { WhatsappConnectionsService } from './whatsapp-connections.service';

@Controller('whatsapp/connections')
export class WhatsappConnectionsController {
  constructor(private readonly connections: WhatsappConnectionsService) {}

  @Get('embedded-signup/config')
  embeddedSignupConfig(@Headers('authorization') authorization?: string) {
    return this.connections.getEmbeddedSignupConfig(authorization);
  }

  @Post('embedded-signup/complete')
  completeEmbeddedSignup(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: { code?: string; waba_id?: string; phone_number_id?: string },
  ) {
    return this.connections.completeEmbeddedSignup({
      authorization,
      code: body.code || '',
      wabaId: body.waba_id,
      phoneNumberId: body.phone_number_id,
    });
  }

  @Get()
  list(@Headers('authorization') authorization?: string) {
    return this.connections.listForAuthorization(authorization);
  }

  @Delete(':id')
  revoke(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') id: string,
    @Body() body: { reason?: string },
  ) {
    return this.connections.revoke(authorization, id, body.reason);
  }
}
