import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../database/database.service';
import { EmbeddingsService } from '../embeddings/embeddings.service';

type UpsertKnowledgeDocumentInput = {
  companyId: string;
  sourceType: string;
  sourceId: string;
  title: string;
  mimeType: string;
  sourceVersion?: string | null;
  sourceModifiedAt?: string | null;
  text: string;
  metadata?: Record<string, unknown>;
};

@Injectable()
export class KnowledgeService {
  constructor(
    private readonly db: DatabaseService,
    private readonly embeddings: EmbeddingsService,
    private readonly config: ConfigService,
  ) {}

  chunkText(text: string, maxChars = 1800): string[] {
    const chunks: string[] = [];
    let cursor = 0;

    while (cursor < text.length) {
      chunks.push(text.slice(cursor, cursor + maxChars).trim());
      cursor += maxChars;
    }

    return chunks.filter(Boolean);
  }

  async upsertDocumentWithChunks(input: UpsertKnowledgeDocumentInput) {
    const normalized = this.normalizeText(input.text);
    const chunks = this.chunkText(normalized);

    const documentResult = await this.db.query<{ id: string }>(
      `insert into knowledge_documents (
         company_id, source_type, source_id, title, mime_type, source_version,
         source_modified_at, status, metadata
       )
       values ($1, $2, $3, $4, $5, $6, $7, 'indexed', $8)
       on conflict (company_id, source_type, source_id)
       do update set
         title = excluded.title,
         mime_type = excluded.mime_type,
         source_version = excluded.source_version,
         source_modified_at = excluded.source_modified_at,
         status = 'indexed',
         metadata = excluded.metadata,
         updated_at = now()
       returning id`,
      [
        input.companyId,
        input.sourceType,
        input.sourceId,
        input.title,
        input.mimeType,
        input.sourceVersion || null,
        input.sourceModifiedAt || null,
        JSON.stringify(input.metadata || {}),
      ],
    );

    const documentId = documentResult.rows[0].id;
    await this.db.query('delete from knowledge_chunks where document_id = $1', [documentId]);

    for (const [index, chunk] of chunks.entries()) {
      const chunkResult = await this.db.query<{ id: string }>(
        `insert into knowledge_chunks (
           company_id, document_id, chunk_index, content, token_count, metadata
         )
         values ($1, $2, $3, $4, $5, $6)
         returning id`,
        [
          input.companyId,
          documentId,
          index,
          chunk,
          this.estimateTokens(chunk),
          JSON.stringify({ source_id: input.sourceId }),
        ],
      );

      await this.indexChunk(input.companyId, chunkResult.rows[0].id, chunk);
    }

    return {
      document_id: documentId,
      chunk_count: chunks.length,
      character_count: normalized.length,
    };
  }

  private normalizeText(text: string) {
    return text
      .replace(/\r/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]{2,}/g, ' ')
      .trim();
  }

  private estimateTokens(text: string) {
    return Math.ceil(text.length / 4);
  }

  private async indexChunk(companyId: string, chunkId: string, content: string) {
    const embedding = await this.embeddings.embedText(content);
    const provider = this.config.get<string>('EMBEDDINGS_PROVIDER') || 'deepseek';
    const model = this.config.get<string>('EMBEDDINGS_MODEL') || 'deepseek-embedding';

    await this.db.query(
      `insert into knowledge_embeddings (
         company_id, chunk_id, provider, model, embedding
       )
       values ($1, $2, $3, $4, $5::vector)
       on conflict (chunk_id, provider, model)
       do update set embedding = excluded.embedding`,
      [companyId, chunkId, provider, model, `[${embedding.join(',')}]`],
    );
  }
}
