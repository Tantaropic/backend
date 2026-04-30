import { AssetClass } from '../../../common/enums';

export interface TradeResponseDto {
  success: boolean;
  tradeId: string;
  assetClass: AssetClass;
  units: bigint;
  executionPrice: bigint;
  totalAmount: bigint;
}
