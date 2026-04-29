import { Controller, Post, Body } from '@nestjs/common';
import { MockBankService } from './mock-bank.service';
import {
  SimulateTransactionDto,
  CollectFundsDto,
  DepositFundsDto,
  BankTransactionResponseDto,
  BankOperationResponseDto,
} from './dtos';

@Controller('mock-bank')
export class MockBankController {
  constructor(private readonly bankService: MockBankService) {}

  /**
   * Simulates a user making a purchase at a merchant.
   * Generates a mock transaction and sends it to the webhook endpoint via HTTP.
   * @param dto - Optional overrides for userId, amount, and merchantTag.
   * @returns The generated bank transaction details.
   */
  @Post('simulate-transaction')
  simulateTransaction(
    @Body() dto: SimulateTransactionDto,
  ): Promise<BankTransactionResponseDto> {
    return this.bankService.simulateTransaction(dto);
  }

  /**
   * Simulates collecting round-up funds from the user's bank account.
   * @param dto - Collection details with amount and idempotency key.
   * @returns Operation confirmation.
   */
  @Post('collect-funds')
  collectFunds(@Body() dto: CollectFundsDto): BankOperationResponseDto {
    return this.bankService.collectFunds(dto);
  }

  /**
   * Simulates depositing money back to the user's bank account.
   * @param dto - Deposit details with amount and idempotency key.
   * @returns Operation confirmation.
   */
  @Post('deposit-funds')
  depositFunds(@Body() dto: DepositFundsDto): BankOperationResponseDto {
    return this.bankService.depositFunds(dto);
  }
}
