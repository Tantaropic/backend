import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import { WalletRepository } from './wallet.repository';
import { LedgerEntryType } from '../../common/enums';
import { CreditFiatDto } from './dtos/credit-fiat.dto';
import { DebitFiatDto } from './dtos/debit-fiat.dto';

/**
 * WalletService — Domain service for fiat balance operations.
 * Handles crediting/debiting the DigitalWallet with OCC,
 * posting matching ledger entries, and updating the Profile AUM.
 */
@Injectable()
export class WalletService {
  private readonly operationsIdempotency = new Set<string>();
  private readonly logger = new Logger(WalletService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly walletRepo: WalletRepository,
  ) {}

  /**
   * Credits fiat to the wallet after a redemption (sell) or deposit.
   * Atomically: increment fiatBalance (OCC), bump AUM, post ledger entry.
   *
   * @returns the updated wallet version
   */
  async creditFiat(params: CreditFiatDto): Promise<{ newVersion: number }> {
    const { userId, walletId, amount, ledgerType, idempotencyKey, note } =
      params;
    const minor = amount.toMinorUnit();

    const wallet = await this.prisma.digitalWallet.findUniqueOrThrow({
      where: { id: walletId },
      include: { profile: true },
    });

    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Increment fiat balance (OCC)
      const walletUpdate = await tx.digitalWallet.updateMany({
        where: { id: walletId, version: wallet.version },
        data: {
          fiatBalance: { increment: minor.amount },
          version: { increment: 1 },
        },
      });
      if (walletUpdate.count === 0) {
        throw new Error('Concurrency conflict: wallet version mismatch');
      }

      // 2. Bump AUM on profile
      const profileUpdate = await tx.profile.updateMany({
        where: { id: wallet.profileId, version: wallet.profile.version },
        data: {
          aum: { increment: minor.amount },
          version: { increment: 1 },
        },
      });
      if (profileUpdate.count === 0) {
        throw new Error('Concurrency conflict: profile version mismatch');
      }

      // 3. Post ledger entry
      await tx.ledgerEntry.create({
        data: {
          userId,
          walletId,
          type: ledgerType,
          amount: minor.amount,
          currency: minor.currency,
          idempotencyKey,
          note,
        },
      });

      return { newVersion: wallet.version + 1 };
    });

    this.logger.log(
      `Credited ${minor.amount} to wallet ${walletId} (${ledgerType})`,
    );
    return result;
  }

  /**
   * Debits fiat from the wallet (withdrawal to bank).
   * Atomically: decrement fiatBalance (OCC), decrement AUM, post ledger entry.
   * Throws if insufficient balance.
   */
  async debitFiat(params: DebitFiatDto): Promise<{ newVersion: number }> {
    const { userId, walletId, amount, idempotencyKey, note } = params;
    const minor = amount.toMinorUnit();

    const wallet = await this.prisma.digitalWallet.findUniqueOrThrow({
      where: { id: walletId },
      include: { profile: true },
    });

    if (wallet.fiatBalance < minor.amount) {
      throw new BadRequestException(
        `Insufficient fiat balance. Available: ${wallet.fiatBalance}, Requested: ${minor.amount}`,
      );
    }

    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Decrement fiat balance (OCC)
      const walletUpdate = await tx.digitalWallet.updateMany({
        where: { id: walletId, version: wallet.version },
        data: {
          fiatBalance: { decrement: minor.amount },
          version: { increment: 1 },
        },
      });
      if (walletUpdate.count === 0) {
        throw new Error('Concurrency conflict: wallet version mismatch');
      }

      // 2. Decrement AUM on profile
      const profileUpdate = await tx.profile.updateMany({
        where: { id: wallet.profileId, version: wallet.profile.version },
        data: {
          aum: { decrement: minor.amount },
          version: { increment: 1 },
        },
      });
      if (profileUpdate.count === 0) {
        throw new Error('Concurrency conflict: profile version mismatch');
      }

      // 3. Post ledger entry
      await tx.ledgerEntry.create({
        data: {
          userId,
          walletId,
          type: LedgerEntryType.USER_WITHDRAWAL,
          amount: minor.amount,
          currency: minor.currency,
          idempotencyKey,
          note: note ?? 'Withdrawal to bank account',
        },
      });

      return { newVersion: wallet.version + 1 };
    });

    this.logger.log(
      `Debited ${minor.amount} from wallet ${walletId} (USER_WITHDRAWAL)`,
    );
    return result;
  }

  /**
   * Fetches the wallet for a given user's profile.
   */
  async getWalletByUserId(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: {
        profile: {
          include: { wallet: true },
        },
      },
    });

    if (!user.profile.wallet) {
      throw new BadRequestException(
        `No wallet found for user ${userId}'s profile`,
      );
    }

    return user.profile.wallet;
  }

  /**
   * Checks if an operation with the given idempotency key has already been processed.
   */
  checkIdempotency(idempotencyKey: string): boolean {
    if (this.operationsIdempotency.has(idempotencyKey)) {
      return true;
    }
    this.operationsIdempotency.add(idempotencyKey);
    return false;
  }

  /**
   * Generates a unique key for withdrawal idempotency.
   */
  static withdrawIdempotencyKey(idempotencyKey: string): string {
    return `withdrawal:${idempotencyKey}`;
  }
}
