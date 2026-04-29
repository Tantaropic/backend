/**
 * Defines the fixed-point precision for asset units.
 * 1 real unit (e.g. 1 gram of gold, 1 share) = ASSET_UNIT_PRECISION internal units.
 * This allows fractional ownership to be stored as BigInt without floating-point errors.
 *
 * Mirrors the precision of the original Decimal(18, 8) schema.
 * Example: 0.00155555 grams of gold = 155_555 internal units.
 */
export const ASSET_UNIT_PRECISION = 100_000_000; // 1e8
