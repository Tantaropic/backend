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
import { StringifiedJSON, serialize } from '../../common/helpers/json-helper';
import {
  TradeRequestDto,
  TradeResponseDto,
  TradeType,
} from './external-dtos/trade.dto';
import { PriceResponseDto } from './external-dtos/price.dto';

@Injectable()
export class ExchangeIntegrationService implements IExchangeProvider {
  private readonly logger = new Logger(ExchangeIntegrationService.name);
  private readonly baseUrl: string;

  constructor(
    private readonly http: HttpClientService,
    private readonly config: ConfigService,
  ) {
    this.baseUrl = `${this.config.get<string>('BASE_URL')}/mock-exchange`;
  }

  async buyAsset(request: ITradeAssetRequest): Promise<ITradeResult> {
    return this.executeTrade(request, TradeType.BUY);
  }

  async sellAsset(request: ITradeAssetRequest): Promise<ITradeResult> {
    return this.executeTrade(request, TradeType.SELL);
  }

  async getLatestPrice(assetClass: AssetClass): Promise<Money> {
    this.logger.log(`Fetching latest price for ${assetClass}`);

    try {
      const response = await this.http.get<PriceResponseDto>(
        `${this.baseUrl}/prices/${assetClass}`,
      );

      // Map primitive back to Money VO
      return Money.fromSmallestUnit(response.price, response.currency);
    } catch (error) {
      this.logger.error(`Failed to fetch price for ${assetClass}`);
      throw error;
    }
  }

  /**
   * Internal helper to handle trade execution and mapping.
   */
  private async executeTrade(
    request: ITradeAssetRequest,
    type: TradeType,
  ): Promise<ITradeResult> {
    this.logger.log(
      `Executing ${type} order for ${request.assetClass} | User: ${request.userId}`,
    );

    const externalPayload: TradeRequestDto = {
      userId: request.userId,
      ticker: request.assetClass,
      type: type,
      quantity: request.units,
      totalCost: request.totalCost.amount,
      currency: request.totalCost.currency,
      idempotencyKey: request.idempotencyKey,
    };

    const payloadStringified = serialize<TradeRequestDto>(externalPayload);

    try {
      const response = await this.http.post<
        StringifiedJSON<TradeRequestDto>,
        TradeResponseDto
      >(`${this.baseUrl}/trade`, payloadStringified);

      return {
        success: response.success,
        message: response.message,
        transactionId: response.tradeId,
        executedUnits: response.executedQuantity,
        executionPrice:
          response.executionPrice !== undefined &&
          response.currency !== undefined
            ? Money.fromSmallestUnit(response.executionPrice, response.currency)
            : undefined,
        totalCost:
          response.finalTotalCost !== undefined &&
          response.currency !== undefined
            ? Money.fromSmallestUnit(response.finalTotalCost, response.currency)
            : undefined,
      };
    } catch (error) {
      this.logger.error(`${type} order failed for user ${request.userId}`);
      throw error;
    }
  }
}
