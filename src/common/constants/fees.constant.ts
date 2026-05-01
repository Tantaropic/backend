export const FUND_FEE_BRACKETS = [
  { upTo: 1_000n * 100n, bps: 50 }, // 0 - 1,000 USD: 0.50%
  { upTo: 10_000n * 100n, bps: 40 }, // 1,000 - 10,000 USD: 0.40%
  { upTo: 100_000n * 100n, bps: 30 }, // 10,000 - 100,000 USD: 0.30%
  { upTo: 1_000_000n * 100n, bps: 20 }, // 100,000 - 1,000,000 USD: 0.20%
  { upTo: 10_000_000n * 100n, bps: 10 }, // 1,000,000 - 10,000,000 USD: 0.10%
  { upTo: null, bps: 1 }, // >10,000,000 USD: 0.05%
] as const;
