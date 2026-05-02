import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma/prisma.module';
import { InvestmentService } from './investment.service';
import { InvestmentController } from './investment.controller';
import { RedemptionOrchestratorService } from './redemption-orchestrator.service';
import { ExchangeIntegrationModule } from '../exchange-integration/exchange-integration.module';
import { WalletModule } from '../wallet/wallet.module';
import { FeeModule } from '../fee/fee.module';

/**
 * InvestmentModule — Owns asset allocation (buy), redemption (sell), and the orchestrator.
 *
 * - InvestmentService: event-driven allocation (FUNDS_READY_FOR_INVESTMENT) + sellAsset()
 * - RedemptionOrchestratorService: synchronous sell → fee → wallet credit → emit
 * - InvestmentController: POST /api/v1/investment/redeem
 */
@Module({
  imports: [PrismaModule, ExchangeIntegrationModule, WalletModule, FeeModule],
  controllers: [InvestmentController],
  providers: [InvestmentService, RedemptionOrchestratorService],
  exports: [InvestmentService, RedemptionOrchestratorService],
})
export class InvestmentModule {}
