import { AiProvidersModule } from '../ai-providers/ai-providers.module';
import { Module } from '@nestjs/common';
import { OAuthTokenCryptoService } from '../security/oauth-token-crypto.service';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappConnectionsController } from './whatsapp-connections.controller';
import { WhatsappConnectionsService } from './whatsapp-connections.service';
import { WhatsappService } from './whatsapp.service';
import { WhatsappTemplatesController } from './whatsapp-templates.controller';
import { WhatsappTemplatesService } from './whatsapp-templates.service';
import { SalesAgentModule } from '../sales-agent/sales-agent.module';
import { ConversationControlModule } from '../conversations/conversation-control.module';

@Module({
  imports: [AiProvidersModule, SalesAgentModule, ConversationControlModule],
  controllers: [WhatsappController, WhatsappConnectionsController, WhatsappTemplatesController],
  providers: [WhatsappService, WhatsappConnectionsService, WhatsappTemplatesService, OAuthTokenCryptoService],
  exports: [WhatsappService, WhatsappConnectionsService],
})
export class WhatsappModule {}
