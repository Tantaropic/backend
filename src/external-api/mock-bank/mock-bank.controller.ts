import { Controller, Post, Body } from '@nestjs/common';
import { MockBankService } from './mock-bank.service';
import {
  FundTransferRequestDto,
  FundTransferResponseDto,
  SimulateTransactionRequestDto,
  SimulateTransactionResponseDto,
} from './dto';
import { JsonHelper } from '../../common/helpers';

@Controller('mock-bank')
export class MockBankController {
  private readonly bankService: MockBankService;
  constructor(bankService: MockBankService) {
    this.bankService = bankService;
  }

  /**
   * Simulates a user making a purchase at a merchant.
   * Generates a mock transaction and sends it to the  endpoint via HTTP.
   * @param dto - Optional overrides for userId, amount, and merchantTag.
   * @returns The generated bank transaction details.
   */
  @Post('simulate-transaction')
  async simulateTransaction(
    @Body() dto: Partial<SimulateTransactionRequestDto>,
  ) {
    const transactionDto = this.bankService.fakeTransactionIfEmpty(dto);
    const response = await this.bankService.simulateTransaction(transactionDto);
    return JsonHelper.replaceBigInts<SimulateTransactionResponseDto>(response);
  }

  /**
   * Simulates collecting round-up funds from the user's bank account.
   * @param dto - Collection details with amount and idempotency key.
   * @returns Operation confirmation.
   */
  @Post('debits')
  debit(@Body() dto: FundTransferRequestDto) {
    const response = this.bankService.debit(dto);
    return JsonHelper.replaceBigInts<FundTransferResponseDto>(response);
  }

  /**
   * Simulates depositing money back to the user's bank account.
   * @param dto - Deposit details with amount and idempotency key.
   * @returns Operation confirmation.
   */
  @Post('deposits')
  deposit(@Body() dto: FundTransferRequestDto) {
    const response = this.bankService.deposit(dto);
    return JsonHelper.replaceBigInts<FundTransferResponseDto>(response);
  }
}
