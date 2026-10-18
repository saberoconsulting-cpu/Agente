import { Body, Controller, Post } from '@nestjs/common';
import { SalesAgentService } from './sales-agent.service';

type TestMessageBody = {
  company_id?: string;
  message: string;
  conversation_id?: string;
  lead_id?: string;
};

@Controller('sales-agent')
export class SalesAgentController {
  constructor(private readonly salesAgent: SalesAgentService) {}

  @Post('test-message')
  testMessage(@Body() body: TestMessageBody) {
    return this.salesAgent.respondToMessage({
      companyId: body.company_id || 'sabero',
      message: body.message,
      conversationId: body.conversation_id,
      leadId: body.lead_id,
    });
  }

  @Post('opportunity-brief')
  createOpportunityBrief(
    @Body()
    body: {
      company_id?: string;
      conversation_id?: string;
      lead_id?: string;
      next_step?: string;
    },
  ) {
    return this.salesAgent.createOpportunityBrief({
      companyId: body.company_id || 'sabero',
      conversationId: body.conversation_id,
      leadId: body.lead_id,
      nextStep: body.next_step,
    });
  }
}
