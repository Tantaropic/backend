import { AssetClass } from '@prisma/client';
import { Money } from '../domain/value-objects/money.vo';

/**
 * Injection Token for the Exchange Provider.
 * Allows decoupling the core domain from external exchange implementations.
 */
export const I_EXCHANGE_PROVIDER = Symbol('I_EXCHANGE_PROVIDER');

/**
 * Request payload for trading assets (Buy or Sell).
 */
export interface ITradeAssetRequest {
  userId: string;
  assetClass: AssetClass;
  /**
   * The number of units to trade (e.g., grams of gold in smallest unit, or shares).
   */
  units: bigint;
  /**
   * The total cost/revenue of the trade in fiat (Money VO).
   */
  totalCost: Money;
  /**
   * For ensuring atomicity across retries.
   */
  idempotencyKey: string;
  metadata?: Record<string, any>;
}

/**
 * Standard result for all exchange trade operations.
 */
export interface ITradeResult {
  success: boolean;
  message?: string;
  /**
   * Unique ID provided by the external exchange for this trade.
   */
  transactionId?: string;
  /**
   * The actual number of units executed by the exchange.
   */
  executedUnits?: bigint;
  /**
   * The price per single unit at the time of execution.
   */
  executionPrice?: Money;
  /**
   * The final total fiat value of the trade.
   */
  totalCost?: Money;
}

/**
 * Port interface for external Exchange Providers (e.g., Gold bullion dealer, Fund manager).
 * strictly enforces the Anti-Corruption Layer (ACL) by using Domain Value Objects.
 */
export interface IExchangeProvider {
  /**
   * Executes a buy order for a specific asset class.
   */
  buyAsset(request: ITradeAssetRequest): Promise<ITradeResult>;

  /**
   * Executes a sell order for a specific asset class.
   */
  sellAsset(request: ITradeAssetRequest): Promise<ITradeResult>;

  /**
   * Fetches the current market price for 1 unit of the given asset class.
   */
  getLatestPrice(assetClass: AssetClass): Promise<Money>;
}
