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

// Bank events payload.
export type TransactionWebhookReceivedEventPayload = {
  transactionEventId: string;
  merchantTag?: MerchantTag;
  idempotencyKey?: string;
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
} & BaseEventPayload;

