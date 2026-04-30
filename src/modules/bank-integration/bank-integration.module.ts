import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '../../common/http/http.module';
import { BankIntegrationService } from './bank-integration.service';
import { I_BANK_PROVIDER } from '../../common/interfaces/bank-provider.interface';
import { BankIntegrationController } from './bank-integration.controller';

@Module({
  imports: [ConfigModule, HttpModule],
  controllers: [BankIntegrationController],
  providers: [
    BankIntegrationService,
    {
      provide: I_BANK_PROVIDER,
      useExisting: BankIntegrationService,
    },
  ],
  exports: [I_BANK_PROVIDER, BankIntegrationService],
})
export class BankIntegrationModule {}
