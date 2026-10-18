import { Controller, Get, Param, Query } from '@nestjs/common';
import { ConversationsService } from './conversations.service';

@Controller('conversations')
export class ConversationsController {
  constructor(private readonly conversations: ConversationsService) {}

  @Get()
  list(
    @Query('company_id') companyId = 'sabero',
    @Query('limit') limit = '50',
  ) {
    return this.conversations.list(companyId, Number(limit));
  }

  @Get(':id/messages')
  messages(
    @Param('id') id: string,
    @Query('company_id') companyId = 'sabero',
    @Query('limit') limit = '100',
  ) {
    return this.conversations.messages(companyId, id, Number(limit));
  }
}
