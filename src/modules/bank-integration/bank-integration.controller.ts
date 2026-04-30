import { Body, Controller, Post } from '@nestjs/common';
import { BankIntegrationService } from './bank-integration.service';
import {
  TransactionWebhookRequestDto,
  TransactionWebhookResponseDto,
} from './external-dtos/transaction-webhock.dto';

@Controller('bank-integrations')
export class BankIntegrationController {
  constructor(
    private readonly bankIntegrationService: BankIntegrationService,
  ) {}

  @Post('transaction-webhook')
  transactionWebhook(
    @Body() dto: TransactionWebhookRequestDto,
  ): TransactionWebhookResponseDto {
    const response = this.bankIntegrationService.handleTransactionWebhook(dto);
    return response;
  }
}
