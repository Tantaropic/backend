import { AssetClass, Currency } from '../../../common/enums';
import { Money } from '../../../common/domain/value-objects/money.vo';

/**
 * In-memory price snapshot held by `PriceFeedService`. Not persisted.
 * Returned from `getAll()` / `get()` and consumed by `WalletProjectionService`
 * (and the SSE bridge) as the canonical "current market price" view.
 */
export interface PriceTick {
  asset: AssetClass;
  pricePerUnit: Money;
  previousPrice: Money | null;
  deltaBps: number;
  updatedAt: Date;
}

/**
 * Outbound HTTP shape for `GET /prices` and `GET /prices/:asset`.
 * Money is serialized as a major-unit decimal string so clients never see BigInt.
 */
export class PriceTickResponseDto {
  asset!: AssetClass;
  /** Major-unit decimal string, e.g. "452.25". */
  pricePerUnit!: string;
  currency!: Currency;
  deltaBps!: number;
  updatedAt!: string; // ISO
}
