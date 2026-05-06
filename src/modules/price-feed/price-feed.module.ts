import { Module } from '@nestjs/common';
import { PriceFeedService } from './price-feed.service';
import { PriceFeedController } from './price-feed.controller';
import { ExchangeIntegrationModule } from '../exchange-integration/exchange-integration.module';
import { MockExchangeModule } from '../../external-api/mock-exchange/mock-exchange.module';

@Module({
  imports: [ExchangeIntegrationModule, MockExchangeModule],
  controllers: [PriceFeedController],
  providers: [PriceFeedService],
  exports: [PriceFeedService],
})
export class PriceFeedModule {}
