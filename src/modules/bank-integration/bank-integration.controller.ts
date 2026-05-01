import { Body, Controller, Post } from '@nestjs/common';
import { BankIntegrationService } from './bank-integration.service';
import {
  TransactionWebhookRequestDto,
  TransactionWebhookResponseDto,
} from './external-dtos/transaction-webhook.dto';

@Controller('bank-integrations')
export class BankIntegrationController {
  constructor(
    private readonly bankIntegrationService: BankIntegrationService,
  ) {}

  @Post('transaction-webhook')
  async transactionWebhook(
    @Body() dto: TransactionWebhookRequestDto,
  ): Promise<TransactionWebhookResponseDto> {
    const response =
      await this.bankIntegrationService.handleTransactionWebhook(dto);
    return response;
  }
}
