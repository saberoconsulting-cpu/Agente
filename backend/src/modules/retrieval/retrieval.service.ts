import { Injectable } from '@nestjs/common';
import { VectorSearchRepository } from '../../infrastructure/prisma/vector-search.repository';
import { EmbeddingsService } from '../embeddings/embeddings.service';

@Injectable()
export class RetrievalService {
  constructor(
    private readonly vectors: VectorSearchRepository,
    private readonly embeddings: EmbeddingsService,
  ) {}

  async searchTextByCompany(companyId: string, text: string, limit = 6) {
    const embedding = await this.embeddings.embedText(text);
    return this.searchByCompany(companyId, embedding, limit);
  }

  async searchByCompany(companyId: string, embedding: number[], limit = 6) {
    return this.vectors.search(companyId, embedding, Math.min(Math.max(limit, 1), 20));
  }
}
