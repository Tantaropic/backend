import { Controller, Get, Param } from '@nestjs/common';
import { AiInsightsService } from './ai-insights.service';
import { ok } from '../../common/helpers/response.helper';
import type { IApiResponse } from '../../common/dtos/response.dto';
import type { AiInsight } from '@prisma/client';

@Controller('ai-insights')
export class AiInsightsController {
  constructor(private readonly aiInsightsService: AiInsightsService) {}

  @Get(':userId')
  async getUserInsights(
    @Param('userId') userId: string,
  ): Promise<IApiResponse<AiInsight[]>> {
    const insights = await this.aiInsightsService.getUserInsights(userId);
    return ok(insights, 'Insights retrieved successfully');
  }
}
