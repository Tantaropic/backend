import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma/prisma.module';
import { FeeCalculatorService } from './fee.calculator.service';
import { FeeEngineService } from './fee.engine.service';

@Module({
  imports: [PrismaModule],
  providers: [FeeCalculatorService, FeeEngineService],
  exports: [FeeCalculatorService],
})
export class FeeModule {}
