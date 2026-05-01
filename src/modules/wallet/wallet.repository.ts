import { Injectable } from '@nestjs/common';
import { DigitalWallet, WalletPosition } from '@prisma/client';
import { BaseRepository } from '../../common/repositories/base.repository';
import { PrismaService } from '../../database/prisma/prisma.service';
import { AssetClass } from '../../common/enums';

/**
 * WalletRepository acts as the "Anti-Corruption Layer" (ACL) between the DB and the Domain.
 * It manages the DigitalWallet and WalletPosition models, implementing Optimistic Concurrency Control (OCC)
 * to prevent race conditions during high-concurrency trades.
 */
@Injectable()
export class WalletRepository extends BaseRepository<DigitalWallet> {
  constructor(prisma: PrismaService) {
    super(prisma, 'digitalWallet');
  }

  /**
   * Increments the fiat balance of a wallet using Optimistic Concurrency Control.
   */
  async incrementFiatBalance(
    walletId: string,
    amount: bigint,
    currentVersion: number,
  ): Promise<DigitalWallet> {
    const walletUpdate = await this.prisma.digitalWallet.update({
      where: {
        id: walletId,
        version: currentVersion,
      },
      data: {
        fiatBalance: { increment: amount },
        version: { increment: 1 },
      },
    });

    if (!walletUpdate) {
      throw new Error(
        'Concurrency conflict: Wallet version mismatch or wallet not found',
      );
    }

    return walletUpdate;
  }

  /**
   * Updates or creates a wallet position using Optimistic Concurrency Control.
   * It checks the version column of the DigitalWallet to ensure no other process modified the wallet
   * during the transaction.
   *
   * All financial units (BigInt) should be calculated in the domain before calling this method.
   */
  async updatePosition(
    walletId: string,
    assetClass: AssetClass,
    newUnits: bigint,
    currentVersion: number,
  ): Promise<WalletPosition> {
    // 1. Validate version and increment (Optimistic Concurrency Control)
    // If version doesn't match, count will be 0, indicating a concurrency conflict.
    const walletUpdate = await this.prisma.digitalWallet.updateMany({
      where: {
        id: walletId,
        version: currentVersion,
      },
      data: {
        version: { increment: 1 },
      },
    });

    if (walletUpdate.count === 0) {
      throw new Error(
        'Concurrency conflict: Wallet version mismatch or wallet not found',
      );
    }

    // 2. Update or create the position for the specific asset class
    return this.prisma.walletPosition.upsert({
      where: {
        walletId_assetClass: {
          walletId,
          assetClass,
        },
      },
      update: {
        totalUnits: newUnits,
      },
      create: {
        walletId,
        assetClass,
        totalUnits: newUnits,
        averageBuyPrice: 0n, // Smallest unit, e.g., piasters or basis points
      },
    });
  }
}
