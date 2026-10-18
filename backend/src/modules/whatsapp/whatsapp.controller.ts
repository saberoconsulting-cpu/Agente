import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Post,
  Query,
  RawBodyRequest,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { PublicRoute } from '../security/public.decorator';
import { WhatsappService } from './whatsapp.service';

@PublicRoute()
@Controller('whatsapp/webhook')
export class WhatsappController {
  constructor(private readonly whatsapp: WhatsappService) {}

  @Get()
  verify(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') verifyToken: string,
    @Query('hub.challenge') challenge: string,
  ) {
    return this.whatsapp.verifyWebhook(mode, verifyToken, challenge);
  }

  @HttpCode(200)
  @Post()
  async receive(
    @Body() body: unknown,
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-hub-signature-256') signature?: string,
  ) {
    await this.whatsapp.receiveWebhook(body, req.rawBody, signature);
    return { ok: true };
  }
}
