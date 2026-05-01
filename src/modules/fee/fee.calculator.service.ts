import { Injectable } from '@nestjs/common';
import { Money } from '../../common/domain/value-objects/money.vo';
import { getFundFeeBps } from '../../common/constants/fee-registry';

export interface FundFeeBreakdown {
  bps: number;
  fee: Money;
  net: Money;
}

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
}
