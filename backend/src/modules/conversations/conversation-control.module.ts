import { Module } from '@nestjs/common';
import { ConversationControlService } from './conversation-control.service';
@Module({ providers: [ConversationControlService], exports: [ConversationControlService] })
export class ConversationControlModule {}
