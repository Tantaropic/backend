import { CurrencyRegistry } from '../../common/constants/currency.registry';
import { Currency } from '../../common/enums';

/**
 * The round-up step in major currency units.
 * All transactions are rounded up to the next multiple of this value.
 */
const ROUND_UP_STEP = 5n;

/**
 * Calculates the round-up amount to the next multiple of 5 major units.
 * If the amount is already an exact multiple of 5, a full 5 is still collected.
 *
 * All math uses BigInt to maintain absolute financial precision.
 *
 * @example EGP (multiplier = 100, step = 500 piasters):
 *   1030 piasters (10.30 EGP) → next 15 EGP → roundUp = 470 piasters (4.70 EGP)
 *    650 piasters  (6.50 EGP) → next 10 EGP → roundUp = 350 piasters (3.50 EGP)
 *    200 piasters  (2.00 EGP) → next  5 EGP → roundUp = 300 piasters (3.00 EGP)
 *   1410 piasters (14.10 EGP) → next 15 EGP → roundUp =  90 piasters (0.90 EGP)
 *   1500 piasters (15.00 EGP) → next 20 EGP → roundUp = 500 piasters (5.00 EGP)
 *   2000 piasters (20.00 EGP) → next 25 EGP → roundUp = 500 piasters (5.00 EGP)
 *
 * @param amountInSmallest - Transaction amount in smallest currency unit (e.g., piasters)
 * @param currency - Currency enum value (e.g., Currency.EGP)
 * @returns Round-up amount in smallest currency unit (bigint). Always > 0.
 */
export function calculateRoundUp(
  amountInSmallest: bigint,
  currency: Currency,
): bigint {
  const multiplier = CurrencyRegistry[currency].multiplier;
  const stepInSmallest = ROUND_UP_STEP * multiplier;

  const remainder = amountInSmallest % stepInSmallest;

  // If exact multiple of 5 → still collect a full step
  if (remainder === 0n) return stepInSmallest;

  return stepInSmallest - remainder;
}

