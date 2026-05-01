import { Money } from '../../../common/domain/value-objects/money.vo';

export interface SaleInput {
  units: bigint;
  /** Per-unit market price at execution time (smallest unit). */
  executionPrice: Money;
  /** Per-unit weighted-average buy price from WalletPosition (smallest unit). */
  averageBuyPrice: bigint;
}

export interface SaleProfitBreakdown {
  proceeds: Money;
  costOfSold: Money;
  realizedProfit: Money;
}

export interface ProfitFeeBreakdown {
  bps: number;
  fee: Money;
}
