import { Currency } from '../enums/index';

export const CurrencyRegistry = {
  [Currency.EGP]: {
    multiplier: BigInt(100),
    majorUnit: 'Pound',
    minorUnit: 'Piaster',
  },
  // USD: {
  //   code: 'USD',
  //   multiplier: BigInt(100),
  //   majorUnit: 'Dollar',
  //   minorUnit: 'Cent',
  // },
} as const;
