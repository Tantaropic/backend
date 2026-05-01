import { Currency } from '../../enums/index';
import {
  CurrencyRegistry,
  type CurrencyConfig,
} from '../../constants/currency.registry';
import { MoneyUnit } from '../../enums';

/**
 * Money Value Object (VO) — single source of truth for financial amounts.
 *
 * ### Core contract
 * - `amount` stores **exactly what was passed to the factory** — no silent conversion.
 * - `unit` tells callers which denomination `amount` is in.
 * - Human-readable unit names (Pound / Piaster) are fetched from the registry on demand.
 * - All arithmetic operations **always return a `'minor'` result**, ensuring math never
 *   accidentally operates on major-unit values.
 *
 * ### Factory methods
 * | Factory                          | Input unit       | `unit` field |
 * |----------------------------------|------------------|--------------|
 * | `Money.fromMinorUnit(n, cur)`    | Piasters / Cents | `'minor'`    |
 * | `Money.fromMajorUnit(n, cur)`    | Pounds / Dollars | `'major'`    |
 *
 * ### Conversion helpers
 * | Helper                        | Returns                                           |
 * |-------------------------------|---------------------------------------------------|
 * | `money.toAsMinorUnit()`       | New `Money` in `'minor'` unit (converts if needed)|
 * | `money.toAsMajorUnit()`       | New `Money` in `'major'` unit (converts if needed)|
 * | `Money.normalize(a, b)`       | Both operands as `'minor'`, after guard checks     |
 */
export class Money {
  private constructor(
    /** Raw amount as supplied to the factory — see `unit` for its denomination. */
    public readonly amount: bigint,
    public readonly currency: Currency,
    /** Which unit `amount` is expressed in. */
    public readonly unit: MoneyUnit,
  ) {}

  // ─── Factory Methods ──────────────────────────────────────────────────────

  /**
   * Creates a Money instance whose `amount` is in the **minor unit** (Piasters / Cents).
   * No conversion applied. Use when reading from the database or wire format.
   */
  public static fromMinorUnit(
    amount: bigint | number,
    currency: Currency,
  ): Money {
    return new Money(BigInt(amount), currency, MoneyUnit.MINOR);
  }

  /**
   * Creates a Money instance whose `amount` is in the **major unit** (Pounds / Dollars).
   * The value is stored as-is; conversion to minor happens lazily inside arithmetic.
   * Use this for user-facing input, e.g. "deposit 50 EGP".
   *
   * @example Money.fromMajorUnit(50, Currency.EGP).toString() → "50 Pounds (EGP)"
   */
  public static fromMajorUnit(
    amount: bigint | number,
    currency: Currency,
  ): Money {
    return new Money(BigInt(amount), currency, MoneyUnit.MAJOR);
  }

  // ─── Unit helpers ─────────────────────────────────────────────────────────

  /** Returns true when `amount` is stored in minor units (Piasters / Cents). */
  public isMinorUnit(): boolean {
    return this.unit === MoneyUnit.MINOR;
  }

  /** Returns true when `amount` is stored in major units (Pounds / Dollars). */
  public isMajorUnit(): boolean {
    return this.unit === MoneyUnit.MAJOR;
  }

  /**
   * Returns a **new** `Money` always in minor units (`'minor'`).
   * - If already `'minor'` — returns `this` unchanged (no allocation).
   * - If `'major'` — multiplies `amount` by the currency multiplier exactly once.
   */
  public toMinorUnit(): Money {
    if (this.unit === MoneyUnit.MINOR) return this;

    const { multiplier } = Money.getConfig(this.currency);

    return new Money(this.amount * multiplier, this.currency, MoneyUnit.MINOR);
  }

  /**
   * Returns a **new** `Money` always in major units (`'major'`).
   * - If already `'major'` — returns `this` unchanged.
   * - If `'minor'` — divides `amount` by the currency multiplier exactly once.
   *
   * ⚠️  The result is suitable for display and round-trip factory calls only.
   *     Do NOT pass a `'major'` Money directly into arithmetic without normalising first.
   */
  public toMajorUnit(): Money {
    if (this.unit === MoneyUnit.MAJOR) return this;

    const { multiplier } = Money.getConfig(this.currency);

    return new Money(this.amount / multiplier, this.currency, MoneyUnit.MAJOR);
  }

  // ─── Normalization guard ──────────────────────────────────────────────────

  /**
   * Asserts that two Money objects share the **same currency** and the **same unit**,
   * then returns both converted to minor units, ready for safe arithmetic.
   *
   * Throws if currencies differ or if units differ (prevents mixing major and minor
   * operands silently — force callers to be explicit about conversion first).
   *
   * @example
   *   const [a, b] = Money.normalize(userInput, dbValue);
   *   return new Money(a.amount + b.amount, ...);
   */
  public static normalize(a: Money, b: Money): [Money, Money] {
    if (a.currency !== b.currency) {
      throw new Error(
        `Currency mismatch: Cannot normalize ${String(a.currency)} and ${String(b.currency)}`,
      );
    }
    if (a.unit !== b.unit) {
      throw new Error(
        `Unit mismatch: Cannot normalize '${a.unit}' and '${b.unit}' — convert both to the same unit first`,
      );
    }

    return [a.toMinorUnit(), b.toMinorUnit()];
  }

  // ─── Arithmetic (always normalises to minor, returns minor) ───────────────

  /** Adds two Money objects. Both are normalised to minor before computing. */
  public add(other: Money): Money {
    Money.assertSameCurrency(this, other, 'add');

    const a = this.toMinorUnit();
    const b = other.toMinorUnit();

    return new Money(a.amount + b.amount, a.currency, MoneyUnit.MINOR);
  }

  /** Adds multiple Money objects. All must share the same currency. */
  public static add(...moneys: Money[]): Money {
    if (moneys.length === 0) throw new Error('No Money objects to add');

    const [first, ...rest] = moneys;

    for (const m of rest) Money.assertSameCurrency(first, m, 'add');

    const total = moneys.reduce((acc, m) => acc + m.toMinorUnit().amount, 0n);

    return new Money(total, first.currency, MoneyUnit.MINOR);
  }

  /**
   * Subtracts another Money from this one.
   * Throws on currency mismatch or if the result would drop below zero.
   */
  public subtract(other: Money): Money {
    Money.assertSameCurrency(this, other, 'subtract');

    const a = this.toMinorUnit();
    const b = other.toMinorUnit();

    const result = a.amount - b.amount;

    return new Money(result, a.currency, MoneyUnit.MINOR);
  }

  /** Subtracts multiple Money objects from the first. All must share the same currency. */
  public static subtract(...moneys: Money[]): Money {
    if (moneys.length === 0) throw new Error('No Money objects to subtract');

    const [first, ...rest] = moneys;

    for (const m of rest) Money.assertSameCurrency(first, m, 'subtract');

    const result = moneys.reduce((acc, m) => acc - m.toMinorUnit().amount, 0n);

    return new Money(result, first.currency, MoneyUnit.MINOR);
  }

  /** Returns the modulo of this amount divided by `other`. Both normalised to minor. */
  public mod(other: Money): Money {
    Money.assertSameCurrency(this, other, 'mod');

    const a = this.toMinorUnit();
    const b = other.toMinorUnit();

    return new Money(a.amount % b.amount, a.currency, MoneyUnit.MINOR);
  }

  // ─── Comparisons ─────────────────────────────────────────────────────────

  /** Returns the larger of two Money objects. Throws on currency mismatch. */
  public static max(m1: Money, m2: Money): Money {
    Money.assertSameCurrency(m1, m2, 'max');

    const a = m1.toMinorUnit();
    const b = m2.toMinorUnit();

    return a.amount >= b.amount ? m1 : m2;
  }

  /** Returns true if the minor-unit amount is zero. */
  public isZero(): boolean {
    return this.toMinorUnit().amount === 0n;
  }

  /** Returns true if this amount (normalised) is greater than `other`. */
  public isGreaterThan(other: Money): boolean {
    Money.assertSameCurrency(this, other, 'isGreaterThan');

    return this.toMinorUnit().amount > other.toMinorUnit().amount;
  }

  // ─── Serialisation ────────────────────────────────────────────────────────

  /**
   * Unwraps the Money object into flat primitives for DB persistence, DTOs, or external APIs.
   * Always yields the **minor-unit** amount to guarantee correct storage.
   */
  public toPrimitives(): {
    amount: bigint;
    currency: Currency;
    unit: MoneyUnit.MINOR;
  } {
    const minor = this.toMinorUnit();

    return {
      amount: minor.amount,
      currency: this.currency,
      unit: MoneyUnit.MINOR,
    };
  }

  /** Debug-friendly string. e.g. "5000 Piasters (EGP)" or "50 Pounds (EGP)". */
  public toString(): string {
    const config: CurrencyConfig = Money.getConfig(this.currency);

    const unitName = config.denomination[this.unit];

    return `${this.amount} ${unitName} (${String(this.currency)})`;
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private static getConfig(currency: Currency): CurrencyConfig {
    const config = CurrencyRegistry[currency];
    if (!config) throw new Error(`Unsupported currency: ${String(currency)}`);
    return config;
  }

  private static assertSameCurrency(a: Money, b: Money, op: string): void {
    if (a.currency !== b.currency) {
      throw new Error(
        `Currency mismatch: Cannot ${op} ${String(a.currency)} and ${String(b.currency)}`,
      );
    }
  }
}
