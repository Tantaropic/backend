import { ConfigService } from '@nestjs/config';
const configService = new ConfigService();

export const SYSTEM_API_URLS = {
  HOST: configService.get<string>('HOST'),
  PORT: configService.get<number>('PORT'),
  BASE_URL: `${configService.get<string>('HOST')}:${configService.get<number>('PORT')}`,
  TRANSACTION_WEBHOOK_URL: `${configService.get<string>('HOST')}:${configService.get<number>('PORT')}/gateway/bank/webhook/transaction/{{transactionId}}`,
};
