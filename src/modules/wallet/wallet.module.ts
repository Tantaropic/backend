import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma/prisma.module';
import { WalletRepository } from './wallet.repository';
import { WalletProjectionService } from './wallet-projection.service';
import { PriceFeedModule } from '../price-feed/price-feed.module';

/**
 * WalletModule — owns the DigitalWallet and WalletPosition aggregates.
 * Exports WalletRepository so other modules (e.g., LedgerModule) can inject it.
 */
@Module({
  imports: [PrismaModule, PriceFeedModule],
  providers: [WalletRepository, WalletProjectionService],
  exports: [WalletRepository, WalletProjectionService],
})
export class WalletModule {}
