import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AssetClass } from '@prisma/client';
import { Money } from '../../common/domain/value-objects/money.vo';
import {
  IExchangeProvider,
  ITradeAssetRequest,
  ITradeResult,
} from '../../common/interfaces/exchange-provider.interface';
import { HttpClientService } from '../../common/http';
import { BuyAssetRequestDto } from './external-dtos/buy.dto';
import { SellAssetRequestDto } from './external-dtos/sell.dto';
import { TradeResponseDto } from './external-dtos/trade.dto';
import { PriceQuoteResponseDto } from './external-dtos/price.dto';

@Injectable()
export class ExchangeIntegrationService implements IExchangeProvider {
  private readonly logger = new Logger(ExchangeIntegrationService.name);
  private readonly exchangeBaseUrl: string;
  private readonly exchangePricesRoute: string;
  private readonly exchangeBuyRoute: string;
  private readonly exchangeSellRoute: string;
  private readonly exchangeSetPricesRoute: string;

  constructor(
    private readonly http: HttpClientService,
    private readonly config: ConfigService,
  ) {
    const baseUrl = this.config.get<string>(
      'BASE_URL',
      'http://localhost:5001/api/v1',
    );

    this.exchangeBaseUrl = `${baseUrl}/${this.config.get<string>(
      'MOCK_EXCHANGE_ROUTE',
      'mock-exchange',
    )}`;
    this.exchangePricesRoute = `${baseUrl}/${this.config.get<string>(
      'MOCK_EXCHANGE_PRICES',
      'mock-exchange/prices',
    )}`;
    this.exchangeBuyRoute = `${baseUrl}/${this.config.get<string>(
      'MOCK_EXCHANGE_BUY',
      'mock-exchange/buy',
    )}`;
    this.exchangeSellRoute = `${baseUrl}/${this.config.get<string>(
      'MOCK_EXCHANGE_SELL',
      'mock-exchange/sell',
    )}`;
    this.exchangeSetPricesRoute = `${baseUrl}/${this.config.get<string>(
      'MOCK_EXCHANGE_SET_PRICES',
      'mock-exchange/set-prices',
    )}`;
  }

  /**
   * Executes an external BUY order.
   * @param request {ITradeAssetRequest}
   * @returns {ITradeResult}
   */
  async buyAsset(request: ITradeAssetRequest): Promise<ITradeResult> {
    this.logger.log(`Initiating external BUY for user ${request.userId}`);

    const externalPayload: BuyAssetRequestDto = {
      assetClass: request.assetClass,
      amount: request.totalCost.amount,
      currency: request.totalCost.currency,
      idempotencyKey: request.idempotencyKey,
    };

    try {
      // HttpClientService.post() handles BigInt serialization internally —
      // pre-serializing here would double-stringify and produce invalid JSON.
      const response = await this.http.post<
        BuyAssetRequestDto,
        TradeResponseDto
      >(this.exchangeBuyRoute, externalPayload);

      return {
        success: response.success,
        message: response.message,
        transactionId: response.tradeId,
        executedUnits:
          response.units !== undefined ? BigInt(response.units) : undefined,
        executionPrice:
          response.executionPrice !== undefined &&
          request.totalCost.currency !== undefined
            ? Money.fromMinorUnit(
                BigInt(response.executionPrice),
                request.totalCost.currency,
              )
            : undefined,
        totalCost:
          response.totalAmount !== undefined &&
          request.totalCost.currency !== undefined
            ? Money.fromMinorUnit(
                BigInt(response.totalAmount),
                request.totalCost.currency,
              )
            : undefined,
      };
    } catch (error) {
      this.logger.error(`BUY order failed for user ${request.userId}`);
      throw error;
    }
  }

  /**
   * Executes an external SELL order.
   * @param request {ITradeAssetRequest}
   * @returns {ITradeResult}
   */
  async sellAsset(request: ITradeAssetRequest): Promise<ITradeResult> {
    this.logger.log(`Initiating external SELL for user ${request.userId}`);

    const externalPayload: SellAssetRequestDto = {
      assetClass: request.assetClass,
      units: request.units,
      idempotencyKey: request.idempotencyKey,
    };

    try {
      const response = await this.http.post<
        SellAssetRequestDto,
        TradeResponseDto
      >(this.exchangeSellRoute, externalPayload);

      return {
        success: response.success,
        message: response.message,
        transactionId: response.tradeId,
        executedUnits:
          response.units !== undefined ? BigInt(response.units) : undefined,
        executionPrice:
          response.executionPrice !== undefined &&
          request.totalCost.currency !== undefined
            ? Money.fromMinorUnit(
                BigInt(response.executionPrice),
                request.totalCost.currency,
              )
            : undefined,
        totalCost:
          response.totalAmount !== undefined &&
          request.totalCost.currency !== undefined
            ? Money.fromMinorUnit(
                BigInt(response.totalAmount),
                request.totalCost.currency,
              )
            : undefined,
      };
    } catch (error) {
      this.logger.error(`SELL order failed for user ${request.userId}`);
      throw error;
    }
  }

  /**
   * Fetches the latest price for a given asset class.
   * @param assetClass {AssetClass}
   * @returns {Promise<Money>}
   */
  async getLatestPrice(assetClass: AssetClass): Promise<Money> {
    this.logger.log(`Fetching latest price for ${assetClass}`);

    try {
      const response = await this.http.get<PriceQuoteResponseDto>(
        `${this.exchangePricesRoute}?assetClass=${assetClass}`,
      );

      const priceData = response.prices.find(
        (p) => p.assetClass === assetClass,
      );
      if (!priceData) {
        throw new Error(`Price not found for ${assetClass}`);
      }

      // Map primitive back to Money VO
      return Money.fromMinorUnit(priceData.pricePerUnit, priceData.currency);
    } catch (error) {
      this.logger.error(`Failed to fetch price for ${assetClass}`);
      throw error;
    }
  }
}
