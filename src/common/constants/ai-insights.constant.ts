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
