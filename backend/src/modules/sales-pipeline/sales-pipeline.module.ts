import { Module } from '@nestjs/common';
import { AiProvidersModule } from '../ai-providers/ai-providers.module';
import { SalesPipelineService } from './sales-pipeline.service';

@Module({ imports: [AiProvidersModule], providers: [SalesPipelineService], exports: [SalesPipelineService] })
export class SalesPipelineModule {}
