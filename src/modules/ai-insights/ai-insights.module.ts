import { Module } from '@nestjs/common';
import { AiInsightsController } from './ai-insights.controller';
import { AiInsightsService } from './ai-insights.service';
import { AiInsightsRepository } from './ai-insights.repository';

@Module({
  controllers: [AiInsightsController],
  providers: [AiInsightsService, AiInsightsRepository],
  exports: [AiInsightsService],
})
export class AiInsightsModule {}
