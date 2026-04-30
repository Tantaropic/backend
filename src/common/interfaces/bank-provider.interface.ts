import type { Money } from '../domain/value-objects/money.vo';

export const MERCHANT_TAGS = [
  'coffee_shop',
  'restaurant',
  'grocery',
  'gas_station',
  'pharmacy',
  'clothing',
  'electronics',
  'online_shopping',
  'food_delivery',
  'ride_share',
  'cigarettes',
  'fast_food',
  'vape_shop',
  'entertainment',
  'gym',
] as const;

export type MerchantTag = (typeof MERCHANT_TAGS)[number];

/**
 * Injection token for the Bank Provider port.
 * Core modules should use this token to inject the bank implementation.
 */
export const I_BANK_PROVIDER = Symbol('I_BANK_PROVIDER');

/**
 * Internal domain-safe request for transferring funds (Debit/Deposit).
 * Uses the Money Value Object to ensure financial precision.
 */
export interface IFundTransferRequest {
  userId: string;
  money: Money;
  idempotencyKey: string;
  metadata?: Record<string, any>;
}

/**
 * Internal domain-safe result for fund transfer operations.
 */
export interface IFundTransferResult {
  success: boolean;
  message?: string;
  money?: Money;
  transactionId?: string;
  userId?: string;
  metadata?: Record<string, any>;
}

/**
 * The Port (Interface)I for bank integrations.
 * Any external bank adapter (e.g., MockBank, Stripe, etc.) must implement this.
 */
export interface ISimulateTransactionRequestDto {
  userId: string;
  money: Money;
  merchantTag: MerchantTag;
  idempotencyKey: string;
}

/** */
export interface ISimulateTransactionResponseDto {
  success: boolean;
  message?: string;
  transactionId?: string;
  userId?: string;
  money?: Money;
}

/**
 * The Payload for a webhook notification sent from the external bank.
 */
export interface ITransactionWebhookRequestDto {
  userId: string;
  transactionId: string;
  money: Money;
  occurredAt: string;
  merchantTag: MerchantTag;
}

/**
 * The Response for a webhook notification sent from the external bank.
 */
export interface ITransactionWebhookResponseDto {
  success: boolean;
  transactionId: string;
}

/**
 * The Port (Interface)I for bank integrations.
 * Any external bank adapter (e.g., MockBank, Stripe, etc.) must implement this.
 */
export interface IBankProvider {
  /**
   * Withdraws funds from the user's external bank account.
   */
  debit(request: IFundTransferRequest): Promise<IFundTransferResult>;

  /**
   * Deposits funds back into the user's external bank account.
   */
  deposit(request: IFundTransferRequest): Promise<IFundTransferResult>;

  /**
   * Simulates a transaction with the external bank.
   */
  simulateTransaction(
    request: Partial<ISimulateTransactionRequestDto>,
  ): Promise<ISimulateTransactionResponseDto>;
}
