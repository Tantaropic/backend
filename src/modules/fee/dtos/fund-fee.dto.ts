import { Money } from '../../../common/domain/value-objects/money.vo';

export interface FundFeeBreakdown {
  bps: number;
  fee: Money;
  net: Money;
}
