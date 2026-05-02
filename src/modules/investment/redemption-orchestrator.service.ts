import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InvestmentService } from '../investment/investment.service';
import { FeeEngineService } from '../fee/fee.engine.service';
import { WalletService } from '../wallet/wallet.service';
import { EventType, EventsPayloads } from '../../common/events';
import { LedgerEntryType } from '../../common/enums';
import { RedeemAssetDto } from './dtos/redeem-asset.dto';
import { RedeemResponseDto } from './dtos/redeem-response.dto';

/**
 * RedemptionOrchestratorService — Synchronous orchestrator for the redemption (sell) flow.
 *
 * Executes these steps in order; all must succeed before emitting the final event:
 *   1. InvestmentService.sellAsset   → realized fiat proceeds
 *   2. FeeEngineService.deductProfitFeeOnRedemption → profit fee calculated & posted
 *   3. WalletService.creditFiat      → net proceeds credited to wallet + AUM
 *   4. Emit INVESTMENT_REDEMPTION_COMPLETED
 */
@Injectable()
export class RedemptionOrchestratorService {
  private readonly logger = new Logger(RedemptionOrchestratorService.name);

  constructor(
    private readonly investmentService: InvestmentService,
    private readonly feeEngine: FeeEngineService,
    private readonly walletService: WalletService,
    private readonly events: EventEmitter2,
  ) {}

  /**
   * Orchestrates a full redemption: sell → fee → credit → event.
   */
  async redeemAsset(params: RedeemAssetDto): Promise<RedeemResponseDto> {
    const { userId, assetClass, units } = params;
    const idempotencyKey = `redeem:${userId}:${assetClass}:${Date.now()}`;

    this.logger.log(
      `Starting redemption: ${units} ${assetClass} for user ${userId}`,
    );

    // 0. Resolve the user's wallet
    const wallet = await this.walletService.getWalletByUserId(userId);
    const walletId = wallet.id;

    // ─── Step 1: Sell the asset ─────────────────────────────────────────────
    const sellResult = await this.investmentService.sellAsset({
      userId,
      walletId,
      assetClass,
      units,
      idempotencyKey,
    });

    this.logger.log(
      `Step 1 complete: sold ${sellResult.executedUnits} ${assetClass} for ${sellResult.proceeds.amount}`,
    );

    // ─── Step 2: Calculate & post profit fee ────────────────────────────────
    const { profitFee, netProceeds } =
      await this.feeEngine.deductProfitFeeOnRedemption({
        userId,
        walletId,
        executedUnits: sellResult.executedUnits,
        executionPrice: sellResult.executionPrice,
        averageBuyPrice: sellResult.averageBuyPrice,
        idempotencyKey,
      });

    this.logger.log(
      `Step 2 complete: profit fee ${profitFee.amount}, net proceeds ${netProceeds.amount}`,
    );

    // ─── Step 3: Credit net proceeds to wallet ──────────────────────────────
    await this.walletService.creditFiat({
      userId,
      walletId,
      amount: netProceeds,
      ledgerType: LedgerEntryType.INVESTMENT_REDEMPTION,
      idempotencyKey: `${idempotencyKey}:credit`,
      note: `Redemption proceeds: ${netProceeds.amount} (after ${profitFee.amount} profit fee)`,
    });

    this.logger.log(
      `Step 3 complete: credited ${netProceeds.amount} to wallet`,
    );

    // ─── Step 4: Emit final event ───────────────────────────────────────────
    const transactionId = `txn-${idempotencyKey}`;

    this.events.emit(
      EventType.SystemEventType.INVESTMENT_REDEMPTION_COMPLETED,
      {
        userId,
        walletId,
        transactionId,
        assetClass,
        unitsSold: sellResult.executedUnits,
        grossProceeds: sellResult.proceeds,
        profitFee,
        netCreditedToWallet: netProceeds,
        idempotencyKey,
        timestamp: new Date(),
      } satisfies EventsPayloads.RedemptionCompletedEventPayload,
    );

    this.logger.log(
      `Redemption completed for user ${userId}: ${sellResult.executedUnits} ${assetClass}`,
    );

    return {
      transactionId,
      grossProceeds: sellResult.proceeds.amount.toString(),
      profitFee: profitFee.amount.toString(),
      netCredited: netProceeds.amount.toString(),
      assetClass,
      unitsSold: sellResult.executedUnits.toString(),
    };
  }
}
