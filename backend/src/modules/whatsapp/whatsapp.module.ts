import { Module } from '@nestjs/common';
import { OAuthTokenCryptoService } from '../security/oauth-token-crypto.service';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappConnectionsController } from './whatsapp-connections.controller';
import { WhatsappConnectionsService } from './whatsapp-connections.service';
import { WhatsappService } from './whatsapp.service';
import { SalesAgentModule } from '../sales-agent/sales-agent.module';

@Module({
  imports: [SalesAgentModule],
  controllers: [WhatsappController, WhatsappConnectionsController],
  providers: [WhatsappService, WhatsappConnectionsService, OAuthTokenCryptoService],
  exports: [WhatsappService, WhatsappConnectionsService],
})
export class WhatsappModule {}
