import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma/prisma.module';
import { WalletRepository } from './wallet.repository';
import { WalletService } from './wallet.service';
import { WalletController } from './wallet.controller';
import { BankIntegrationModule } from '../bank-integration/bank-integration.module';

/**
 * WalletModule — owns the DigitalWallet and WalletPosition aggregates.
 * Exports WalletRepository and WalletService so other modules (e.g., Redemption) can inject them.
 */
@Module({
  imports: [PrismaModule, BankIntegrationModule],
  controllers: [WalletController],
  providers: [WalletRepository, WalletService],
  exports: [WalletRepository, WalletService],
})
export class WalletModule {}
