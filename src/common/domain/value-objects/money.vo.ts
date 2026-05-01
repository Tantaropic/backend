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
   * Adds multiple Money objects together. Throws if currencies do not match.
   */
  public static add(...moneys: Money[]): Money {
    if (moneys.length === 0) {
      throw new Error('No Money objects to add');
    }
    const firstMoney = moneys[0];
    for (let i = 1; i < moneys.length; i++) {
      if (firstMoney.currency !== moneys[i].currency) {
        throw new Error(
          `Currency mismatch: Cannot add ${String(moneys[i].currency)} to ${String(firstMoney.currency)}`,
        );
      }
    }
    return new Money(
      moneys.reduce((acc, money) => acc + money.amount, 0n),
      firstMoney.currency,
    );
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
   * Subtracts multiple Money objects from this one. Throws if currencies do not match.
   */
  public static subtract(...moneys: Money[]): Money {
    if (moneys.length === 0) {
      throw new Error('No Money objects to subtract');
    }
    const firstMoney = moneys[0];
    for (let i = 1; i < moneys.length; i++) {
      if (firstMoney.currency !== moneys[i].currency) {
        throw new Error(
          `Currency mismatch: Cannot subtract ${String(moneys[i].currency)} from ${String(firstMoney.currency)}`,
        );
      }
    }
    return new Money(
      moneys.reduce((acc, money) => acc - money.amount, 0n),
      firstMoney.currency,
    );
  }

  /**
   * Divides the Money amount by a given divisor. Throws if the divisor is zero.
   * Returns both the quotient and the remainder as Money objects.
   */
  public divideWithRemainder(divisor: bigint | number): {
    quotient: Money;
    remainder: Money;
  } {
    if (divisor === 0 || divisor === 0n)
      throw new Error('Divisor cannot be zero');
    const d = typeof divisor === 'number' ? BigInt(divisor) : divisor;
    return {
      quotient: new Money(this.amount / d, this.currency),
      remainder: new Money(this.amount % d, this.currency),
    };
  }

  /**
   * Unwraps the Money object into flat primitives for external API calls, DTOs, or database persistence.
   */
  public toPrimitives(): { amount: bigint; currency: Currency } {
    return {
      amount: this.amount,
      currency: this.currency,
    };
  }

  /**
   * MultiplyByBps multiplies the Money amount by a basis points value (e.g., for interest calculations).
   */
  public multiplyByBps(bps: number): Money {
    if (!Number.isInteger(bps) || bps < 0) {
      throw new Error('BPS must be a non-negative integer');
    }
    return new Money((this.amount * BigInt(bps)) / 10_000n, this.currency);
  }
}
