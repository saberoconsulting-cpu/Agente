import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { WhatsappConnectionsService } from './whatsapp-connections.service';
import { Roles } from '../security/roles.decorator';
import { CurrentUser } from '../security/current-user.decorator';
import { AuthTokenPayload } from '../auth/token';

@Controller('whatsapp/connections')
export class WhatsappConnectionsController {
  constructor(private readonly connections: WhatsappConnectionsService) {}

  @Get('embedded-signup/config')
  @Roles('owner')
  embeddedSignupConfig(@CurrentUser user: AuthTokenPayload) {
    return this.connections.getEmbeddedSignupConfig(user);
  }

  @Post('embedded-signup/complete')
  @Roles('owner')
  completeEmbeddedSignup(
    @CurrentUser user: AuthTokenPayload,
    @Body() body: { code?: string; waba_id?: string; phone_number_id?: string },
  ) {
    return this.connections.completeEmbeddedSignup({
      authorization: user,
      code: body.code || '',
      wabaId: body.waba_id,
      phoneNumberId: body.phone_number_id,
    });
  }

  @Get()
  @Roles('owner')
  list(@CurrentUser user: AuthTokenPayload) {
    return this.connections.listForAuthorization(user);
  }

  @Delete(':id')
  @Roles('owner')
  revoke(
    @CurrentUser user: AuthTokenPayload,
    @Param('id') id: string,
    @Body() body: { reason?: string },
  ) {
    return this.connections.revoke(user, id, body.reason);
  }
}
