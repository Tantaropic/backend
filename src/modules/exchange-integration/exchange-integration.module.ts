import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ExchangeIntegrationService } from './exchange-integration.service';
import { I_EXCHANGE_PROVIDER } from '../../common/interfaces/exchange-provider.interface';

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: I_EXCHANGE_PROVIDER,
      useClass: ExchangeIntegrationService,
    },
  ],
  exports: [I_EXCHANGE_PROVIDER],
})
export class ExchangeIntegrationModule {}
