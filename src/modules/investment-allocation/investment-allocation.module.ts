import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma/prisma.module';
import { ExchangeIntegrationModule } from '../exchange-integration/exchange-integration.module';
import { InvestmentAllocationService } from './investment-allocation.service';

@Module({
  imports: [PrismaModule, ExchangeIntegrationModule],
  providers: [InvestmentAllocationService],
})
export class InvestmentAllocationModule {}
