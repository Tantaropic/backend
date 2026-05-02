import { AssetClass } from '../../../common/enums';

export interface TradeResponseDto {
  success: boolean;
  tradeId: string;
  assetClass: AssetClass;
  units: string | bigint;
  executionPrice: string | bigint;
  totalAmount: string | bigint;
}
