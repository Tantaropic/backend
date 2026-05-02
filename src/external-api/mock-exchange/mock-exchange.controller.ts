import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { MockExchangeService } from './mock-exchange.service';
import { AssetClass } from '../../common/enums';
import {
  BuyAssetDto,
  SellAssetDto,
  PriceQuoteResponseDto,
  TradeResponseDto,
} from './dtos';
import { JsonHelper } from '../../common/helpers';
@Controller('mock-exchange')
export class MockExchangeController {
  constructor(private readonly exchangeService: MockExchangeService) {}

  /**
   * Returns current market prices for all tradeable assets.
   * @param assetClass - Optional filter for a specific asset class.
   * @returns Price quotes for requested assets.
   */
  @Get('prices')
  getPrices(@Query('assetClass') assetClass?: AssetClass) {
    const allPrices = this.exchangeService.getPrices();
    const filtered = assetClass
      ? allPrices.filter((p) => p.assetClass === assetClass)
      : allPrices;

    return { prices: JsonHelper.replaceBigInts(filtered) };
  }

  /**
   * Executes a mock buy order for a given asset class.
   * @param dto - Buy order details including amount, asset class, and idempotency key.
   * @returns Trade confirmation with units acquired and execution price.
   */
  @Post('buy')
  buy(@Body() dto: BuyAssetDto): TradeResponseDto {
    const trade = this.exchangeService.buy(dto);
    return JsonHelper.replaceBigInts(trade);
  }

  /**
   * Executes a mock sell order for a given asset class.
   * @param dto - Sell order details including units, asset class, and idempotency key.
   * @returns Trade confirmation with proceeds from the sale.
   */
  @Post('sell')
  sell(@Body() dto: SellAssetDto): TradeResponseDto {
    const trade = this.exchangeService.sell(dto);
    return JsonHelper.replaceBigInts(trade);
  }

  /**
   * Admin endpoint to manually set asset prices for demo purposes.
   * @param body - Asset class and new price in smallest currency unit.
   */
  @Post('set-prices')
  setPrices(@Body() body: { assetClass: AssetClass; pricePerUnit: bigint }) {
    this.exchangeService.setPrice(body.assetClass, body.pricePerUnit);
    return JsonHelper.replaceBigInts({ success: true });
  }
}
