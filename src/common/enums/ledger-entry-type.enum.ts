/**
 * All money-movement types stored in the unified LedgerEntry table.
 * Follows the double-entry accounting standard described in core-features.md.
 */
export enum LedgerEntryType {
  SWEEP = 'SWEEP',
  INBOUND_TRANSFER = 'INBOUND_TRANSFER',
  ASSET_ALLOCATION = 'ASSET_ALLOCATION',
  REDEMPTION = 'REDEMPTION',
  FUND_FEE = 'FUND_FEE',
  PROFIT_FEE = 'PROFIT_FEE',
}
