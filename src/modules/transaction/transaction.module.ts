import { Module } from '@nestjs/common';
import { TransactionEventRepository } from './transaction-event.repository';

/**
 * Transaction Module.
 *
 * Owns the TransactionEvent entity — the raw record of every purchase
 * received via bank webhooks.
 *
 * Consumers:
 *   - BankIntegrationService (writes new events)
 *   - RoundUpEngineService (reads + marks processed)
 *   - Fee Engine, AI Engine, Analytics (future readers)
 */
@Module({
  providers: [TransactionEventRepository],
  exports: [TransactionEventRepository],
})
export class TransactionModule {}
