import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AssetClass, Currency } from '../../common/enums';
import { CurrencyRegistry } from '../../common/constants/currency.registry';
import { ASSET_UNIT_PRECISION } from '../../common/constants';
import {
  BuyAssetDto,
  SellAssetDto,
  TradeResponseDto,
  AssetPriceDto,
} from './dtos';

interface PriceEntry {
  pricePerUnit: number;
  updatedAt: Date;
}

/**
 * Simulates an external exchange/market API.
 * Maintains static in-memory prices and executes mock buy/sell trades.
 *
 * Prices are in the smallest currency unit (piasters).
 * Asset units use a fixed-point multiplier (ASSET_UNIT_PRECISION = 1e8)
 * so that fractional ownership works correctly with BigInt storage.
 */
@Injectable()
export class MockExchangeService {
  private readonly logger = new Logger(MockExchangeService.name);
  private readonly idempotencyStore = new Map<string, TradeResponseDto>();

  private readonly prices = new Map<AssetClass, PriceEntry>([
    [AssetClass.GOLD, { pricePerUnit: 450_00, updatedAt: new Date() }],
    [AssetClass.INDEX_FUND, { pricePerUnit: 120_00, updatedAt: new Date() }],
    [AssetClass.HIGH_RISK, { pricePerUnit: 85_00, updatedAt: new Date() }],
  ]);

  /**
   * Returns current prices for all tradeable asset classes.
   * @returns Array of asset prices in smallest currency unit.
   */
  getPrices(): AssetPriceDto[] {
    const result: AssetPriceDto[] = [];

    for (const [assetClass, entry] of this.prices) {
      result.push({
        assetClass,
        pricePerUnit: entry.pricePerUnit,
        currency: Currency.EGP,
        updatedAt: entry.updatedAt.toISOString(),
      });
    }

    return result;
  }

  /**
   * Simulates buying an asset. Converts the spend amount into fractional units
   * using the ASSET_UNIT_PRECISION multiplier.
   *
   * Formula: units = (amountInPiasters * ASSET_UNIT_PRECISION) / pricePerUnit
   *
   * Example with 0.70 EGP on Gold (450 EGP/unit):
   *   70 piasters * 1e8 / 45000 = 155,555 internal units = 0.00155555 grams
   *
   * @param dto - The buy order with asset class, amount (major units), and idempotency key.
   * @returns Trade confirmation with fractional units and execution price.
   */
  buy(dto: BuyAssetDto): TradeResponseDto {
    const existing = this.idempotencyStore.get(dto.idempotencyKey);
    if (existing) {
      this.logger.log(`Idempotent hit for buy: ${dto.idempotencyKey}`);
      return existing;
    }

    const price = this.prices.get(dto.assetClass);
    if (!price) {
      throw new BadRequestException(`Unsupported asset class: ${String(dto.assetClass)}`);
    }

    const multiplier = Number(CurrencyRegistry[dto.currency].multiplier);
    const amountInPiasters = BigInt(Math.round(dto.amount * multiplier));
    const precisionBig = BigInt(ASSET_UNIT_PRECISION);
    const priceBig = BigInt(price.pricePerUnit);
    const units = amountInPiasters * precisionBig / priceBig;
    const totalCost = units * priceBig / precisionBig;

    const response: TradeResponseDto = {
      success: true,
      tradeId: randomUUID(),
      assetClass: dto.assetClass,
      units: Number(units),
      executionPrice: price.pricePerUnit,
      totalAmount: Number(totalCost),
    };

    this.idempotencyStore.set(dto.idempotencyKey, response);
    this.logger.log(
      `BUY ${String(dto.assetClass)}: ${units} units @ ${price.pricePerUnit} = ${totalCost} piasters`,
    );

    return response;
  }

  /**
   * Simulates selling an asset. Converts fractional units back into currency.
   *
   * Formula: proceeds = (units * pricePerUnit) / ASSET_UNIT_PRECISION
   *
   * @param dto - The sell order with asset class, units to sell, and idempotency key.
   * @returns Trade confirmation with proceeds from the sale.
   */
  sell(dto: SellAssetDto): TradeResponseDto {
    const existing = this.idempotencyStore.get(dto.idempotencyKey);
    if (existing) {
      this.logger.log(`Idempotent hit for sell: ${dto.idempotencyKey}`);
      return existing;
    }

    const price = this.prices.get(dto.assetClass);
    if (!price) {
      throw new BadRequestException(`Unsupported asset class: ${String(dto.assetClass)}`);
    }

    const totalProceeds = Number(
      BigInt(dto.units) * BigInt(price.pricePerUnit) / BigInt(ASSET_UNIT_PRECISION),
    );

    const response: TradeResponseDto = {
      success: true,
      tradeId: randomUUID(),
      assetClass: dto.assetClass,
      units: dto.units,
      executionPrice: price.pricePerUnit,
      totalAmount: totalProceeds,
    };

    this.idempotencyStore.set(dto.idempotencyKey, response);
    this.logger.log(
      `SELL ${String(dto.assetClass)}: ${dto.units} units @ ${price.pricePerUnit} = ${totalProceeds} piasters`,
    );

    return response;
  }

  /**
   * Manually sets the price for a given asset class. Used for demo/testing.
   * @param assetClass - The asset to update.
   * @param pricePerUnit - New price in smallest currency unit (piasters).
   */
  setPrice(assetClass: AssetClass, pricePerUnit: number): void {
    this.prices.set(assetClass, {
      pricePerUnit,
      updatedAt: new Date(),
    });
    this.logger.log(
      `Price updated: ${String(assetClass)} → ${pricePerUnit}`,
    );
  }
}
