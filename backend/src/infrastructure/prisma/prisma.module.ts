import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { JobClaimRepository } from './job-claim.repository';
import { VectorSearchRepository } from './vector-search.repository';

@Global()
@Module({
  providers: [PrismaService, JobClaimRepository, VectorSearchRepository],
  exports: [PrismaService, JobClaimRepository, VectorSearchRepository],
})
export class PrismaModule {}
