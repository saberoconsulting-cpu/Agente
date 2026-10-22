import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from './prisma.service';

export type VectorSearchResult = { id: string; content: string; title: string; source_id: string; source_version: string | null; distance: number };

@Injectable()
export class VectorSearchRepository {
  constructor(private readonly prisma: PrismaService) {}

  search(companyId: string, embedding: number[], limit: number): Promise<VectorSearchResult[]> {
    const vector = `[${embedding.join(',')}]`;
    return this.prisma.$queryRaw<VectorSearchResult[]>(Prisma.sql`
      select kc.id, kc.content, kd.title, kd.source_id, kd.source_version,
        (ke.embedding <-> ${vector}::vector) as distance
      from knowledge_embeddings ke
      join knowledge_chunks kc on kc.id = ke.chunk_id and kc.company_id = ke.company_id
      join knowledge_documents kd on kd.id = kc.document_id and kd.company_id = kc.company_id
      where ke.company_id = ${companyId}
        and kd.status = 'indexed'
        and (kd.source_type <> 'google_drive' or exists (
          select 1 from google_drive_files gf where gf.company_id=kd.company_id and gf.google_file_id=kd.source_id and not gf.trashed
        ))
      order by ke.embedding <-> ${vector}::vector limit ${limit}`);
  }
}
