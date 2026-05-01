import { LedgerEntryType, AssetClass } from '../../../common/enums';

export interface LedgerEntryDto {
  userId: string;
  walletId?: string;
  type: LedgerEntryType;
  assetClass?: AssetClass;
  assetUnits?: bigint;
  executionPrice?: bigint;
  transactionEventId?: string;
  idempotencyKey?: string;
  note?: string;
}
