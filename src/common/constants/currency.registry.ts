import { Currency, MoneyUnit } from '../enums';

/**
 * Human-readable names for the major and minor currency units.
 * e.g. { [MoneyUnit.MAJOR]: 'Pound', [MoneyUnit.MINOR]: 'Piaster' }
 */
export interface Denomination {
  [MoneyUnit.MAJOR]: string;
  [MoneyUnit.MINOR]: string;
}

export interface CurrencyConfig {
  /** Conversion factor: 1 major unit = multiplier minor units (e.g. 100 for EGP). */
  multiplier: bigint;
  denomination: Denomination;
}

export const CurrencyRegistry: Record<Currency, CurrencyConfig> = {
  [Currency.EGP]: {
    multiplier: 100n,
    denomination: {
      [MoneyUnit.MAJOR]: 'Pound',
      [MoneyUnit.MINOR]: 'Piaster',
    },
  },
  // [Currency.USD]: {
  //   multiplier: 100n,
  //   denomination: { majorUnit: 'Dollar', minorUnit: 'Cent' },
  // },
} as const;
