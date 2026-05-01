import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../database/prisma/prisma.module';
import { UsersModule } from '../modules/users/users.module';
import { ProfilesModule } from '../modules/profiles/profiles.module';
import { WalletModule } from '../modules/wallet/wallet.module';
import { MockBankModule } from '../external-api/mock-bank/mock-bank.module';
import { ExchangeIntegrationModule } from '../modules/exchange-integration/exchange-integration.module';
import { MockExchangeModule } from '../external-api/mock-exchange/mock-exchange.module';
import { HttpModule } from '../common/http/http.module';
import { LlmModule } from '../common/llm';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { BankIntegrationModule } from '../modules/bank-integration/bank-integration.module';
import { AiInsightsModule } from '../modules/ai-insights/ai-insights.module';
import { RoundUpEngineModule } from '../modules/roundup-engine/roundup-engine.module';
import { PriceFeedModule } from '../modules/price-feed/price-feed.module';
import { RealtimeCommonModule } from '../common/realtime/realtime-common.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    UsersModule,
    ProfilesModule,
    WalletModule,
    MockBankModule,
    ExchangeIntegrationModule,
    MockExchangeModule,
    HttpModule,
    LlmModule,
    BankIntegrationModule,
    AiInsightsModule,
    RoundUpEngineModule,
    EventEmitterModule.forRoot({
      wildcard: true,
      verboseMemoryLeak: true,
    }),
    ScheduleModule.forRoot(),
    RealtimeCommonModule,
    PriceFeedModule,
  ],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
