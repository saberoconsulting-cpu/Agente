import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { EmbeddingsService } from '../embeddings/embeddings.service';

@Injectable()
export class RetrievalService {
  constructor(
    private readonly db: DatabaseService,
    private readonly embeddings: EmbeddingsService,
  ) {}

  async searchTextByCompany(companyId: string, text: string, limit = 6) {
    const embedding = await this.embeddings.embedText(text);
    const result = await this.searchByCompany(companyId, embedding, limit);
    return result.rows;
  }

  async searchByCompany(companyId: string, embedding: number[], limit = 6) {
    return this.db.query<{
      id: string;
      content: string;
      title: string;
      source_id: string;
      source_version: string | null;
      distance: number;
    }>(
      `select kc.id, kc.content, kd.title, kd.source_id, kd.source_version,
              (ke.embedding <-> $2::vector) as distance
       from knowledge_embeddings ke
       join knowledge_chunks kc on kc.id = ke.chunk_id and kc.company_id = ke.company_id
       join knowledge_documents kd on kd.id = kc.document_id and kd.company_id = kc.company_id
       where ke.company_id = $1
       order by ke.embedding <-> $2::vector
       limit $3`,
      [companyId, `[${embedding.join(',')}]`, limit],
    );
  }
}
