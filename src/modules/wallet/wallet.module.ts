import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma/prisma.module';
import { WalletRepository } from './wallet.repository';

/**
 * WalletModule — owns the DigitalWallet and WalletPosition aggregates.
 * Exports WalletRepository so other modules (e.g., LedgerModule) can inject it.
 */
@Module({
  imports: [PrismaModule],
  providers: [WalletRepository],
  exports: [WalletRepository],
})
export class WalletModule {}
