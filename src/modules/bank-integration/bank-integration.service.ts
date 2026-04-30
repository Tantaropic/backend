import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Money } from '../../common/domain/value-objects/money.vo';
import {
  type IFundTransferRequest,
  type IFundTransferResult,
  type IBankProvider,
  type ISimulateTransactionRequestDto,
  type ISimulateTransactionResponseDto,
} from '../../common/interfaces/bank-provider.interface';
import { HttpClientService } from '../../common/http';
import { StringifiedJSON, serialize } from '../../common/helpers/json-helper';
import {
  DebitRequestDto,
  DebitResponseDto,
  DepositRequestDto,
  DepositResponseDto,
  SimulateTransactionRequestDto,
  SimulateTransactionResponseDto,
} from './external-dtos';

/**
 * Adapter implementation for the Bank Provider port.
 * Translates our internal domain types into external-facing DTOs for the Mock Bank API.
 * strictly enforces the Anti-Corruption Layer (ACL).
 */
@Injectable()
export class BankIntegrationService implements IBankProvider {
  private readonly logger = new Logger(BankIntegrationService.name);
  private readonly baseUrl: string;

  constructor(
    private readonly http: HttpClientService,
    private readonly config: ConfigService,
  ) {
    // Construct base URL for external mock bank.
    const host = this.config.get<string>('HOST');
    const port = this.config.get<number>('PORT');
    this.baseUrl = `${host}:${port}`;
  }

  async simulateTransaction(
    request: ISimulateTransactionRequestDto,
  ): Promise<ISimulateTransactionResponseDto> {
    this.logger.log(
      `Simulating external transaction for user ${request.userId}`,
    );

    const externalPayload: SimulateTransactionRequestDto = {
      userId: request.userId,
      ...request.money.toPrimitives(),
      merchantTag: request.merchantTag,
      idempotencyKey: request.idempotencyKey,
    };

    const payloadStringified =
      serialize<SimulateTransactionRequestDto>(externalPayload);

    try {
      const response = await this.http.post<
        StringifiedJSON<SimulateTransactionRequestDto>,
        SimulateTransactionResponseDto
      >(`${this.baseUrl}/mock-bank/simulate-transaction`, payloadStringified);

      // Map External Result back to Domain Result
      return this.mapResponse(response);
    } catch (error) {
      this.logger.error(
        `External transaction simulation failed for user ${request.userId}`,
      );
      throw error;
    }
  }

  /**
   * Translates internal FundTransferRequest into a DebitRequestDto for the external API.
   */
  async debit(payload: IFundTransferRequest): Promise<IFundTransferResult> {
    this.logger.log(`Initiating external DEBIT for user ${payload.userId}`);

    const externalPayload: DebitRequestDto = {
      userId: payload.userId,
      ...payload.money.toPrimitives(),
      idempotencyKey: payload.idempotencyKey,
      metadata: payload.metadata,
    };

    const payloadStringified = serialize<DebitRequestDto>(externalPayload);

    try {
      // Execute external HTTP call via the ACL boundary
      const response = await this.http.post<
        StringifiedJSON<DebitRequestDto>,
        DebitResponseDto
      >(
        `${this.baseUrl}/accounts/${payload.userId}/debits`,
        payloadStringified,
      );

      // Map External Result back to Domain Result
      return this.mapResponse(response);
    } catch (error) {
      this.logger.error(`External DEBIT failed for user ${payload.userId}`);
      throw error;
    }
  }

  /**
   * Translates internal FundTransferRequest into a DepositRequestDto for the external API.
   */
  async deposit(payload: IFundTransferRequest): Promise<IFundTransferResult> {
    this.logger.log(`Initiating external DEPOSIT for user ${payload.userId}`);

    const externalPayload: DepositRequestDto = {
      userId: payload.userId,
      ...payload.money.toPrimitives(),
      idempotencyKey: payload.idempotencyKey,
      metadata: payload.metadata,
    };

    const payloadStringified = serialize<DepositRequestDto>(externalPayload);

    try {
      // Execute external HTTP call via the ACL boundary
      const response = await this.http.post<
        StringifiedJSON<DepositRequestDto>,
        DepositResponseDto
      >(
        `${this.baseUrl}/accounts/${payload.userId}/deposits`,
        payloadStringified,
      );

      // Map External Result back to Domain Result
      return this.mapResponse(response);
    } catch (error) {
      this.logger.error(`External DEPOSIT failed for user ${payload.userId}`);
      throw error;
    }
  }

  /**
   * Private helper to map external API responses back to our internal FundTransferResult.
   */
  private mapResponse(
    external: DebitResponseDto | DepositResponseDto,
  ): IFundTransferResult {
    return {
      success: external.success,
      message: external.message,
      transactionId: external.transactionId,
      userId: external.userId,
      money:
        external.amount !== undefined && external.currency !== undefined
          ? Money.fromSmallestUnit(external.amount, external.currency)
          : undefined,
    };
  }
}
