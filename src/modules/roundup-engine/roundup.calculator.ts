import { Money } from '../../common/domain/value-objects/money.vo';

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
  totalMoney: Money,
  roundUpStep: bigint,
): Money {
  const stepMoney = Money.fromMajorUnit(
    roundUpStep,
    totalMoney.currency,
  ).toMinorUnit();

  const remainder = totalMoney.mod(stepMoney);

  if (remainder.isZero()) {
    return stepMoney;
  }

  return remainder;
}
