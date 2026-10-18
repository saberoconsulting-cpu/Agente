import { Body, Controller, Post } from '@nestjs/common';
import { KnowledgeService } from './knowledge.service';

type ManualKnowledgeBody = {
  company_id?: string;
  title: string;
  text: string;
  source_id?: string;
  metadata?: Record<string, unknown>;
};

@Controller('knowledge')
export class KnowledgeController {
  constructor(private readonly knowledge: KnowledgeService) {}

  @Post('manual-documents')
  createManualDocument(@Body() body: ManualKnowledgeBody) {
    return this.knowledge.upsertDocumentWithChunks({
      companyId: body.company_id || 'sabero',
      sourceType: 'manual',
      sourceId: body.source_id || `manual:${body.title}`,
      title: body.title,
      mimeType: 'text/plain',
      text: body.text,
      metadata: body.metadata || {},
    });
  }
}
