import { Body, Controller, Post, HttpCode, HttpStatus } from '@nestjs/common';
import { ok } from '../../common/helpers/response.helper';
import { IApiResponse } from '../../common/dtos/response.dto';
import { RedeemRequestDto } from './dtos/redeem-request.dto';
import { InvestRequestDto } from './dtos/invest-request.dto';
import { RedemptionOrchestratorService } from './redemption-orchestrator.service';
import { InvestmentService } from './investment.service';
import { Money } from '../../common/domain/value-objects/money.vo';
import { Currency } from '../../common/enums';
import { InvestResponseDto } from './dtos/invest-response.dto';
import { RedeemResponseDto } from './dtos/redeem-response.dto';

@Controller('investment')
export class InvestmentController {
  constructor(
    private readonly orchestrator: RedemptionOrchestratorService,
    private readonly investmentService: InvestmentService,
  ) {}

  // ─── Invest (Fiat → Assets) ────────────────────────────────────────

  /**
   * POST /api/v1/investment/invest
   * Invests a fiat amount from the user's wallet into the 24/75/1 asset allocation.
   *
   * Flow (async pipeline):
   *   1. Debit gross amount from fiat wallet.
   *   2. FeeEngine applies FUND_FEE (0.5%) — async via WALLET_FUNDS_ROUNDUP event.
   *   3. InvestmentService allocates net across Gold / Index Fund / High Risk.
   *
   * Returns immediately after the wallet debit; asset allocation runs asynchronously.
   */
  @Post('invest')
  @HttpCode(HttpStatus.ACCEPTED)
  async invest(
    @Body() dto: InvestRequestDto,
  ): Promise<IApiResponse<InvestResponseDto>> {
    const grossAmount = Money.fromMinorUnit(dto.amount, Currency.EGP);

    const result = await this.investmentService.investAmount({
      userId: dto.userId,
      grossAmount,
      idempotencyKey: dto.idempotencyKey,
    });

    return ok(
      { ...result, queued: true },
      'Investment queued. Funds will be allocated across assets after fee deduction.',
      HttpStatus.ACCEPTED,
    );
  }

  // ─── Redeem (Assets → Fiat) ────────────────────────────────────────

  /**
   * POST /api/v1/investment/redeem
   * Sells a specific asset position and credits the net proceeds to the user's fiat wallet.
   *
   * Flow:
   *   1. Controller validates DTO and converts units string → BigInt.
   *   2. RedemptionOrchestrator executes: sell → profit fee → wallet credit → event.
   */
  @Post('redeem')
  @HttpCode(HttpStatus.OK)
  async redeem(
    @Body() dto: RedeemRequestDto,
  ): Promise<IApiResponse<RedeemResponseDto>> {
    const units = BigInt(dto.units);
    const result = await this.orchestrator.redeemAsset({
      userId: dto.userId,
      assetClass: dto.assetClass,
      units,
    });
    return ok(result, 'Asset redeemed successfully.');
  }
}
