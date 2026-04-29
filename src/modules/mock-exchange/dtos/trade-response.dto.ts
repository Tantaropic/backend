import { AssetClass } from '../../../common/enums';

export interface TradeResponseDto {
  success: boolean;
  tradeId: string;
  assetClass: AssetClass;
  units: number;
  executionPrice: number;
  totalAmount: number;
}
