import { Currency } from '../../enums/index';
import { CurrencyRegistry } from '../../constants/currency.registry';

export class Money {
  private constructor(
    public readonly amount: bigint,
    public readonly currency: Currency,
  ) {}

  /**
   * Creates a Money instance from the smallest unit of the currency (e.g., Piasters or Cents).
   */
  public static fromSmallestUnit(
    amount: bigint | number,
    currency: Currency,
  ): Money {
    return new Money(BigInt(amount), currency);
  }

  /**
   * Creates a Money instance from the major unit of the currency (e.g., Pounds or Dollars).
   * Safely multiplies by the currency's smallest unit multiplier.
   */
  public static fromMajorUnit(amount: number, currency: Currency): Money {
    const registry = CurrencyRegistry[currency];
    if (!registry) {
      throw new Error(`Unsupported currency: ${currency}`);
    }

    // Safely multiply into the smallest unit.
    // Math.round helps prevent floating point artifacts (e.g., 1.05 * 100 = 104.99999999999999) before BigInt cast.
    const smallestUnitAmount = BigInt(
      Math.round(amount * Number(registry.multiplier)),
    );
    return new Money(smallestUnitAmount, currency);
  }

  /**
   * Adds two Money objects together. Throws if currencies do not match.
   */
  public add(other: Money): Money {
    if (this.currency !== other.currency) {
      throw new Error(
        `Currency mismatch: Cannot add ${String(other.currency)} to ${String(this.currency)}`,
      );
    }
    return new Money(this.amount + other.amount, this.currency);
  }

  /**
   * Subtracts another Money object from this one.
   * Throws if currencies do not match, or if the resulting amount would drop below zero.
   */
  public subtract(other: Money): Money {
    if (this.currency !== other.currency) {
      throw new Error(
        `Currency mismatch: Cannot subtract ${String(other.currency)} from ${String(this.currency)}`,
      );
    }
    const result = this.amount - other.amount;
    if (result < 0n) {
      throw new Error(
        `Insufficient funds: Resulting amount cannot be below zero`,
      );
    }
    return new Money(result, this.currency);
  }

  /**
   * Unwraps the Money object into flat primitives for database persistence.
   */
  public toDatabaseValue(): { amount: bigint; currency: Currency } {
    return {
      amount: this.amount,
      currency: this.currency,
    };
  }
}
