import { Module } from '@nestjs/common';
import { OpportunitiesController } from './opportunities.controller';
import { OpportunitiesService } from './opportunities.service';
import { FollowupsModule } from '../followups/followups.module';
import { OpportunitiesRepository } from './repositories/opportunities.repository';
import { SalesPipelineModule } from '../sales-pipeline/sales-pipeline.module';

@Module({ imports: [FollowupsModule, SalesPipelineModule], controllers: [OpportunitiesController], providers: [OpportunitiesService, OpportunitiesRepository], exports: [OpportunitiesService] })
export class OpportunitiesModule {}
