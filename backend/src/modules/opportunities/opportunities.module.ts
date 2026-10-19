import { Module } from '@nestjs/common';
import { OpportunitiesController } from './opportunities.controller';
import { OpportunitiesService } from './opportunities.service';
import { FollowupsModule } from '../followups/followups.module';
import { OpportunitiesRepository } from './repositories/opportunities.repository';

@Module({ imports: [FollowupsModule], controllers: [OpportunitiesController], providers: [OpportunitiesService, OpportunitiesRepository], exports: [OpportunitiesService] })
export class OpportunitiesModule {}
