import { Injectable } from '@nestjs/common';
import { Money } from '../../common/domain/value-objects/money.vo';
import {
  getFundFeeBps,
  getProfitFeeBps,
} from '../../common/constants/fee-registry';
import { Currency } from '../../common/enums';
import { FundFeeBreakdown } from './dtos/fund-fee.dto';
import {
  ProfitFeeBreakdown,
  SaleInput,
  SaleProfitBreakdown,
} from './dtos/profit-fee.dto';

@Injectable()
export class FeeCalculatorService {
  /**
   * Given the gross round-up and the profile's current AUM, returns the FUND_FEE
   * and the net amount that will flow to the Asset Allocator.
   *
   * Math (BigInt, floor-rounded in user's favor):
   *   bps = lookup(aum)
   *   fee = gross * bps / 10_000
   *   net = gross - fee
   */
  calculateFundFee(gross: Money, currentAum: bigint): FundFeeBreakdown {
    const bps = getFundFeeBps(currentAum);
    const fee = gross.multiplyByBps(bps);
    const net = gross.subtract(fee);
    return { bps, fee, net };
  }

  /**
   * WAC-based per-asset profit calculation for a withdrawal sale slice.
   *
   *   proceeds        = units * executionPrice
   *   costOfSold      = units * averageBuyPrice
   *   realizedProfit  = max(0, proceeds - costOfSold)
   *
   * `averageBuyPrice` is unchanged by sells (WAC invariant) — only `units` decreases
   * on the wallet position.
   */
  calculateRealizedProfit(sale: SaleInput): SaleProfitBreakdown {
    if (sale.units < 0n) {
      throw new Error('Sale units must be non-negative');
    }
    const currency: Currency = sale.executionPrice.currency;
    const proceeds = Money.fromSmallestUnit(
      sale.units * sale.executionPrice.amount,
      currency,
    );
    const costOfSold = Money.fromSmallestUnit(
      sale.units * sale.averageBuyPrice,
      currency,
    );

    const profitAmount =
      proceeds.amount > costOfSold.amount
        ? proceeds.amount - costOfSold.amount
        : 0n;
    const realizedProfit = Money.fromSmallestUnit(profitAmount, currency);

    return { proceeds, costOfSold, realizedProfit };
  }

  /**
   * Tiered profit fee (BPS bracket based on the realized-profit amount).
   * Fee is zero when there is no profit (rule from user-stories #3).
   */
  calculateProfitFee(realizedProfit: Money): ProfitFeeBreakdown {
    const bps = getProfitFeeBps(realizedProfit.amount);
    const fee = realizedProfit.multiplyByBps(bps);
    return { bps, fee };
  }
}
