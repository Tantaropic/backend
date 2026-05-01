export type FeeBracket = { upTo: bigint | null; bps: number };

export const FUND_FEE_BRACKETS: readonly FeeBracket[] = [
  { upTo: 1_000n * 100n, bps: 50 },
  { upTo: 10_000n * 100n, bps: 40 },
  { upTo: 100_000n * 100n, bps: 30 },
  { upTo: 1_000_000n * 100n, bps: 20 },
  { upTo: 10_000_000n * 100n, bps: 10 },
  { upTo: null, bps: 1 },
] as const;

export const PROFIT_FEE_BRACKETS: readonly FeeBracket[] = [
  { upTo: 10_000n * 100n, bps: 150 },
  { upTo: 100_000n * 100n, bps: 140 },
  { upTo: 1_000_000n * 100n, bps: 130 },
  { upTo: 10_000_000n * 100n, bps: 120 },
  { upTo: 100_000_000n * 100n, bps: 110 },
  { upTo: null, bps: 100 },
] as const;

function lookup(value: bigint, brackets: readonly FeeBracket[]): number {
  if (value < 0n)
    throw new Error('Fee bracket lookup requires non-negative value');
  for (const b of brackets) {
    if (b.upTo === null || value <= b.upTo) return b.bps;
  }
  // Unreachable: last bracket has upTo=null.
  throw new Error('Fee bracket lookup failed');
}

export function getFundFeeBps(currentAumSmallestUnit: bigint): number {
  return lookup(currentAumSmallestUnit, FUND_FEE_BRACKETS);
}

export function getProfitFeeBps(realizedProfitSmallestUnit: bigint): number {
  return lookup(realizedProfitSmallestUnit, PROFIT_FEE_BRACKETS);
}
