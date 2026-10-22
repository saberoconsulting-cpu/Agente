import { Global, Module } from '@nestjs/common';
import { PlatformService } from './platform.service';
import { MessageStore } from './message-store.service';
import { PlatformController } from './platform.controller';
import { RecordsController } from './records.controller';

@Global()
@Module({ controllers: [PlatformController, RecordsController], providers: [PlatformService, MessageStore, { provide: 'AGENT_MESSAGE_STORE', useExisting: MessageStore }], exports: [PlatformService, MessageStore, 'AGENT_MESSAGE_STORE'] })
export class PlatformModule {}
