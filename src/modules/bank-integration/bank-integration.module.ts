import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BankIntegrationService } from './bank-integration.service';
import { I_BANK_PROVIDER } from '../../common/interfaces/bank-provider.interface';

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: I_BANK_PROVIDER,
      useClass: BankIntegrationService,
    },
  ],
  exports: [I_BANK_PROVIDER],
})
export class BankIntegrationModule {}
