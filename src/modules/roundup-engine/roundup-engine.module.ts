import { Module } from '@nestjs/common';
import { BankIntegrationModule } from '../bank-integration/bank-integration.module';
import { TransactionModule } from '../transaction/transaction.module';
import { UsersModule } from '../users/users.module';
import { RoundUpEngineService } from './roundup-engine.service';
import { LedgerRepository } from '../ledger/ledger.repository';

/**
 * Round-Up Engine Module.
 *
 * Fully isolated — depends only on:
 *   - BankIntegrationModule (for IBankProvider)
 *   - TransactionModule (for TransactionEventRepository)
 *   - LedgerRepository (for writing ROUNDUP entries)
 *   - EventEmitter2 (global, from EventEmitterModule)
 *
 * Can be safely removed from AppModule without affecting any other module.
 */
@Module({
  imports: [BankIntegrationModule, TransactionModule, UsersModule],
  providers: [RoundUpEngineService, LedgerRepository],
})
export class RoundUpEngineModule {}
