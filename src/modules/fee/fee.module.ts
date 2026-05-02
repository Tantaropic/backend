import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma/prisma.module';
import { FeeCalculatorService } from './fee.calculator.service';
import { FeeEngineService } from './fee.engine.service';

/**
 * FeeModule — Owns fund fee + profit fee logic.
 * Exports both the pure calculator and the engine (for orchestrator injection).
 */
@Module({
  imports: [PrismaModule],
  providers: [FeeCalculatorService, FeeEngineService],
  exports: [FeeCalculatorService, FeeEngineService],
})
export class FeeModule {}
