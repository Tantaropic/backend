import type { Money } from '../domain/value-objects/money.vo';
import type { AssetClass } from '../enums';
import type { MerchantTag } from '../interfaces/bank-provider.interface';

type BaseEventPayload = {
  timestamp?: Date;
  userId: string;
  accountId?: string;
  transactionId: string;
};

// Wallet events payload.
type WalletEventPayload = {
  money: Money;
} & BaseEventPayload;

export type WalletDepositEventPayload = WalletEventPayload;
export type WalletWithdrawalEventPayload = WalletEventPayload;
export type WalletBalanceReconciledEventPayload = WalletEventPayload;

// Bank events payload.
export type TransactionWebhookReceivedEventPayload = {
  transactionEventId: string;
  merchantTag?: MerchantTag;
  idempotencyKey: string;
  occurredAt: Date;
} & WalletEventPayload;

// Round-Up events payload.
export type RoundUpCompletedEventPayload = {
  transactionEventId: string;
  grossRoundUpAmount: Money;
  merchantTag?: MerchantTag;
  idempotencyKey: string;
} & BaseEventPayload;

// Trade events payload.
export type TradeOrderExecutedEventPayload = {
  orderId: string;
  idempotencyKey: string;
  asset: AssetClass;
  assetPrice: Money;
  orderQuantity: bigint;
} & BaseEventPayload;

export type AssetPriceChangedEventPayload = {
  assetId?: string;
  asset: AssetClass;
  assetPrice: Money;
  /** Signed change vs the previous tick, in basis points */
  deltaBps?: number;
  /** Last known price before this tick. Undefined on first tick */
  previousPrice?: Money;
} & BaseEventPayload;

// AI events payload.
export type AiInsightGeneratedEventPayload = {
  userId: string;
  insightId: string;
  message: string;
  profileId?: string;
};
// Fee Engine events payload.

/**
 * Emitted by the Bank Integration after a round-up has been debited from the user's
 * external bank and credited (gross) to their in-app wallet. Triggers FUND_FEE deduction.
 */
export type RoundupDebitedEventPayload = {
  userId: string;
  walletId: string;
  transactionEventId: string;
  grossAmount: Money;
  idempotencyKey: string;
} & BaseEventPayload;

/**
 * Emitted by the Fee Engine after FUND_FEE has been deducted from the gross round-up.
 * Consumed by the Asset Allocator to perform the 24/75/1 split on the net amount.
 */
export type FundsReadyForInvestmentEventPayload = {
  userId: string;
  walletId: string;
  transactionEventId: string;
  netAmount: Money;
  idempotencyKey: string;
} & BaseEventPayload;

/**
 * Emitted by the Withdrawal Service before any sells are executed. Carries the per-asset
 * sale plan so the Fee Engine can compute realized profit (WAC) and the PROFIT_FEE.
 */
export type WithdrawalRequestedEventPayload = {
  userId: string;
  walletId: string;
  withdrawalRequestId: string;
  idempotencyKey: string;
  sales: Array<{
    assetClass: AssetClass;
    units: bigint;
    executionPrice: Money;
  }>;
} & BaseEventPayload;

/**
 * Emitted by the Fee Engine after PROFIT_FEE has been posted to the ledger.
 * Consumed by the Withdrawal Service to finalize the net cash transfer to the user.
 */
export type WithdrawalFeeAppliedEventPayload = {
  userId: string;
  walletId: string;
  withdrawalRequestId: string;
  realizedProfit: Money;
  profitFee: Money;
  netToUser: Money;
} & BaseEventPayload;

/**
 * In-memory projection of a user's wallet value at a given price snapshot.
 * Emitted by WalletProjectionService on each ASSET_PRICE_CHANGED tick for
 * users currently subscribed to real-time updates. Never persisted.
 */
export type WalletValueProjectedEventPayload = {
  userId: string;
  profileId: string;
  walletId: string;
  fiatBalance: Money;
  totalValue: Money; // fiat + Σ(units × current price)
  deltaBps: number; // signed change vs the previous projection for this user
  perAsset: Array<{
    asset: AssetClass;
    units: bigint;
    pricePerUnit: Money;
    value: Money;
  }>;
  projectedAt: Date;
};
