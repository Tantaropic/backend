import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma/prisma.module';
import { GoalRepository } from './goal.repository';
import { GoalsController } from './goals.controller';
import { GoalsService } from './goals.service';

@Module({
  imports: [PrismaModule],
  controllers: [GoalsController],
  providers: [GoalRepository, GoalsService],
  exports: [GoalsService, GoalRepository],
})
export class GoalsModule {}
