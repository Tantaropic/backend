/**
 * Tracks which unit the `amount` field is expressed in.
 * - `'MINOR'` → Piasters, Cents  (smallest unit, always safe for arithmetic)
 * - `'MAJOR'` → Pounds, Dollars  (human unit, must be normalised before arithmetic)
 */
export enum MoneyUnit {
  MINOR = 'minor',
  MAJOR = 'major',
}
