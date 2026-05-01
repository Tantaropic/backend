import type { MerchantTag } from '../interfaces/bank-provider.interface';

export const NUDGE_WORTHY_TAGS: readonly MerchantTag[] = [
  'cigarettes',
  'vape_shop',
  'fast_food',
  'coffee_shop',
  'food_delivery',
  'entertainment',
];

export const MILESTONES: readonly number[] = [
  100, 500, 1_000, 5_000, 10_000, 50_000, 100_000, 1_000_000,
];

/**
 * Daily portfolio-pulse cron expression — 09:00 Africa/Cairo.
 * Configured via @nestjs/schedule's CronExpression-compatible string.
 */
export const DAILY_PULSE_CRON = '0 9 * * *';
export const DAILY_PULSE_TZ = 'Africa/Cairo';
