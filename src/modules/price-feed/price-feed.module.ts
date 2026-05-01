import { Module } from '@nestjs/common';
import { PriceFeedService } from './price-feed.service';
import { PriceFeedController } from './price-feed.controller';
import { ExchangeIntegrationModule } from '../exchange-integration/exchange-integration.module';

@Module({
  imports: [ExchangeIntegrationModule],
  controllers: [PriceFeedController],
  providers: [PriceFeedService],
  exports: [PriceFeedService], // SSE dev / WalletProjection can read cache
})
export class PriceFeedModule {}
