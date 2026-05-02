import { Body, Controller, Post, HttpCode, HttpStatus } from '@nestjs/common';
import { ok } from '../../common/helpers/response.helper';
import { IApiResponse } from '../../common/dtos/response.dto';
import { DepositRequestDto } from './dtos/deposit.dto';
import { WithdrawRequestDto } from './dtos/withdraw.dto';
import { WithdrawResponseDto } from './dtos/withdraw-response.dto';
import { WalletService } from './wallet.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { EventType, EventsPayloads } from '../../common/events';
import { Money } from '../../common/domain/value-objects/money.vo';
import { Currency } from '../../common/enums';
import {
  I_BANK_PROVIDER,
  IBankProvider,
} from '../../common/interfaces/bank-provider.interface';
import { Inject } from '@nestjs/common';
import { randomUUID } from 'crypto';

@Controller('wallet')
export class WalletController {
  constructor(
    private readonly walletService: WalletService,
    private readonly events: EventEmitter2,
    @Inject(I_BANK_PROVIDER)
    private readonly bankProvider: IBankProvider,
  ) {}

  // ─── Manual Deposit (Stub — Coming Soon) ─────────────────────────────────

  /**
   * POST /api/v1/wallet/deposit
   * Allows the user to manually deposit funds (top-up).
   * Currently returns a static "coming soon" response.
   */
  @Post('deposit')
  @HttpCode(HttpStatus.OK)
  deposit(
    @Body() dto: Partial<DepositRequestDto>,
  ): IApiResponse<{ status: string; data: any }> {
    // TODO: Implement actual deposit flow:
    //   1. Credit gross to wallet
    //   2. Emit WALLET_FUNDS_DEPOSIT → Fee Engine → FUNDS_READY_FOR_INVESTMENT
    return ok(
      { status: 'coming_soon', data: dto },
      'Manual deposit feature is coming soon.',
      HttpStatus.OK,
    );
  }

  // ─── Withdrawal (Fiat → Bank) ────────────────────────────────────────────

  /**
   * POST /api/v1/wallet/withdraw
   * Transfers fiat balance from the user's digital wallet to their external bank account.
   *
   * Flow:
   *   1. Validate sufficient fiat balance.
   *   2. Debit wallet (OCC), post ledger entry, decrement AUM.
   *   3. Call BankProvider.deposit() to simulate transfer to bank.
   *   4. Emit WITHDRAWAL_COMPLETED.
   */
  @Post('withdraw')
  @HttpCode(HttpStatus.OK)
  async withdraw(
    @Body() dto: WithdrawRequestDto,
  ): Promise<IApiResponse<WithdrawResponseDto>> {
    // Check if the operation has already been processed
    const idempotencyKey = WalletService.withdrawIdempotencyKey(
      dto.idempotencyKey,
    );

    const isProccessedBefore =
      this.walletService.checkIdempotency(idempotencyKey);

    if (isProccessedBefore) {
      return ok(
        { transactionId: dto.idempotencyKey, withdrawn: `${dto.amount} EGP` },
        'Withdrawal already proccessed.',
      );
    }

    // Prepare money value object and fetch user's wallet
    const withdrawMoney = Money.fromMinorUnit(
      dto.amount,
      dto.currency ?? Currency.EGP,
    );
    const wallet = await this.walletService.getWalletByUserId(dto.userId);
    const transactionId = randomUUID();

    // 1. Debit the wallet (throws on insufficient balance or OCC conflict)
    await this.walletService.debitFiat({
      userId: dto.userId,
      walletId: wallet.id,
      amount: withdrawMoney,
      idempotencyKey,
      note: `Withdrawal of ${dto.amount} EGP to bank`,
    });

    // 2. Simulate transfer to user's bank account via BankProvider
    await this.bankProvider.deposit({
      userId: dto.userId,
      money: withdrawMoney,
      idempotencyKey,
      transactionId,
    });

    // 3. Emit WITHDRAWAL_COMPLETED event
    this.events.emit(EventType.SystemEventType.WITHDRAWAL_COMPLETED, {
      userId: dto.userId,
      transactionId,
      money: withdrawMoney,
      timestamp: new Date(),
    } satisfies EventsPayloads.WalletWithdrawalEventPayload);

    return ok(
      {
        transactionId,
        withdrawn: `${dto.amount} EGP`,
      },
      'Withdrawal completed successfully. Funds transferred to bank.',
    );
  }
}
