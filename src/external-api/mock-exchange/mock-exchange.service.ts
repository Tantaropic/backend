import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AssetClass, Currency } from '../../common/enums';
import { ASSET_UNIT_PRECISION } from '../../common/constants';
import {
  BuyAssetDto,
  SellAssetDto,
  TradeResponseDto,
  AssetPriceDto,
  PriceEntry,
} from './dtos';

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
    [
      AssetClass.GOLD,
      {
        currPrice: 72_00n,
        currency: Currency.EGP,
        updatedAt: new Date('2026-01-01T00:00:00Z'),
      },
    ],
    [
      AssetClass.INDEX_FUND,
      {
        currPrice: 16_00n,
        currency: Currency.EGP,
        updatedAt: new Date('2026-01-01T00:00:00Z'),
      },
    ],
    [
      AssetClass.HIGH_RISK,
      {
        currPrice: 20_00n,
        currency: Currency.EGP,
        updatedAt: new Date('2026-01-01T00:00:00Z'),
      },
    ],
  ]);

  /**
   * Returns the price last set by PriceFeedService.
   * No jitter applied here — PriceFeed is the single source of truth.
   */
  private getCurrentPrice(assetClass: AssetClass): bigint {
    const entry = this.prices.get(assetClass);
    return entry?.currPrice ?? 0n;
  }

  /**
   * Returns current prices for all tradeable asset classes.
   * Reflects the latest values pushed by PriceFeedService.
   */
  getPrices(): AssetPriceDto[] {
    const result: AssetPriceDto[] = [];

    for (const [assetClass, entry] of this.prices.entries()) {
      result.push({
        assetClass,
        pricePerUnit: entry.currPrice,
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
   * Formula: units = (amountInMinor * ASSET_UNIT_PRECISION) / pricePerUnit
   *
   * Example with 0.70 EGP on Gold (260 EGP/unit):
   *   70 piasters * 1e8 / 26000 = 269,230 internal units = 0.00269230 grams
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

    const entry = this.prices.get(dto.assetClass);
    if (!entry) {
      throw new BadRequestException(
        `Unsupported asset class: ${String(dto.assetClass)}`,
      );
    }
    const currentPricePerUnit = this.getCurrentPrice(dto.assetClass);

    // Off-the-wire BigInts arrive as strings (no class-validator on this DTO).
    const amountMinor = BigInt(dto.amount);
    const units = (amountMinor * ASSET_UNIT_PRECISION) / currentPricePerUnit;
    const totalCost = (units * currentPricePerUnit) / ASSET_UNIT_PRECISION;

    const response: TradeResponseDto = {
      success: true,
      tradeId: randomUUID(),
      assetClass: dto.assetClass,
      units: units,
      executionPrice: currentPricePerUnit,
      totalAmount: totalCost,
    };

    this.idempotencyStore.set(dto.idempotencyKey, response);
    this.logger.log(
      `BUY ${String(dto.assetClass)}: ${units} units @ ${currentPricePerUnit} = ${totalCost} piasters`,
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

    const entry = this.prices.get(dto.assetClass);
    if (!entry) {
      throw new BadRequestException(
        `Unsupported asset class: ${String(dto.assetClass)}`,
      );
    }
    const currentPricePerUnit = this.getCurrentPrice(dto.assetClass);

    const units = BigInt(dto.units);
    const totalProceeds = (units * currentPricePerUnit) / ASSET_UNIT_PRECISION;

    const response: TradeResponseDto = {
      success: true,
      tradeId: randomUUID(),
      assetClass: dto.assetClass,
      units: units,
      executionPrice: currentPricePerUnit,
      totalAmount: totalProceeds,
    };

    this.idempotencyStore.set(dto.idempotencyKey, response);
    this.logger.log(
      `SELL ${String(dto.assetClass)}: ${units} units @ ${currentPricePerUnit} = ${totalProceeds} piasters`,
    );

    return response;
  }

  /**
   * Manually sets the price for a given asset class. Used for demo/testing.
   * @param assetClass - The asset to update.
   * @param pricePerUnit - New price in smallest currency unit (piasters).
   */
  setPrice(assetClass: AssetClass, pricePerUnit: bigint): void {
    this.prices.set(assetClass, {
      currPrice: pricePerUnit,
      updatedAt: new Date(),
      currency: Currency.EGP,
    });
    this.logger.log(`Price updated: ${String(assetClass)} → ${pricePerUnit}`);
  }
}
