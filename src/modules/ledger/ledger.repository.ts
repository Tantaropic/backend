import { Injectable } from '@nestjs/common';
import { LedgerEntry } from '@prisma/client';
import { BaseRepository } from '../../common/repositories/base.repository';
import { PrismaService } from '../../database/prisma/prisma.service';
import { Money } from '../../common/domain/value-objects/money.vo';
import { LedgerEntryDto } from './dtos/ledger-entry.dto';
import { LedgerEntryType } from '../../common/enums';

/**
 * LedgerRepository acts as the "Anti-Corruption Layer" (ACL) between the DB and the Domain.
 * Its primary responsibility is to handle the conversion between database primitives (BigInt)
 * and the domain's Money Value Object (VO), ensuring financial integrity.
 */
@Injectable()
export class LedgerRepository extends BaseRepository<LedgerEntry> {
  constructor(prisma: PrismaService) {
    super(prisma, 'ledgerEntry');
  }

  /**
   * Saves a new ledger entry.
   * This method "unwraps" the Money VO into amount (BigInt) and currency (string) for Prisma persistence.
   */
  async saveEntry(data: LedgerEntryDto, money: Money): Promise<LedgerEntry> {
    const { amount, currency } = money;

    return await this.db.create({
      data: {
        ...data,
        amount,
        currency,
      },
    });
  }

  /**
   * Calculates the balance for a given user.
   * This method "wraps" the raw database rows back into safe Money VO instances using fromSmallestUnit.
   * All financial math happens inside the Money VO, never using raw numbers in the repository.
   */
  async getBalance(userId: string): Promise<Money> {
    const entries = await this.db.findMany({
      where: { userId },
    });

    // Reduce entries starting with a default 0 balance using safe Money math
    return entries.reduce(
      (total, entry) => {
        // WRAP the raw DB row into the Money VO
        const entryMoney = Money.fromSmallestUnit(entry.amount, entry.currency);

        // Determine if the entry is a credit (addition) or debit (subtraction)
        // Credit-side entries increase the balance; everything else is a debit.
        const isCredit = (
          [
            LedgerEntryType.USER_DEPOSIT,
            LedgerEntryType.ROUNDUP,
          ] as LedgerEntryType[]
        ).includes(entry.type);

        return isCredit ? total.add(entryMoney) : total.subtract(entryMoney);
      },
      Money.fromSmallestUnit(0n, 'EGP'),
    );
  }
}
