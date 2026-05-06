import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { IApiResponse } from '../../common/dtos/response.dto';
import { JsonHelper } from '../../common/helpers';
import { ok } from '../../common/helpers/response.helper';
import { CreateGoalDto, UpdateGoalDto } from './dtos/goal.dto';
import { GoalsService } from './goals.service';

@Controller('users/:userId/goals')
export class GoalsController {
  constructor(private readonly goalsService: GoalsService) {}

  @Get()
  async list(@Param('userId') userId: string): Promise<IApiResponse<any>> {
    const goals = await this.goalsService.listForUser(userId);
    return ok(JsonHelper.replaceBigInts(goals), 'Goals retrieved successfully');
  }

  @Post()
  async create(
    @Param('userId') userId: string,
    @Body() body: CreateGoalDto,
  ): Promise<IApiResponse<any>> {
    const goals = await this.goalsService.createForUser(userId, body);
    return ok(
      JsonHelper.replaceBigInts(goals),
      'Goal created successfully',
      201,
    );
  }

  @Patch(':goalId')
  async update(
    @Param('userId') userId: string,
    @Param('goalId') goalId: string,
    @Body() body: UpdateGoalDto,
  ): Promise<IApiResponse<any>> {
    const goals = await this.goalsService.updateForUser(userId, goalId, body);
    return ok(JsonHelper.replaceBigInts(goals), 'Goal updated successfully');
  }

  @Delete(':goalId')
  async delete(
    @Param('userId') userId: string,
    @Param('goalId') goalId: string,
  ): Promise<IApiResponse<any>> {
    const goals = await this.goalsService.deleteForUser(userId, goalId);
    return ok(JsonHelper.replaceBigInts(goals), 'Goal deleted successfully');
  }
}
