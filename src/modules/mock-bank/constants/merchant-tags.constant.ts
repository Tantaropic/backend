export const MERCHANT_TAGS = [
  'coffee_shop',
  'restaurant',
  'grocery',
  'gas_station',
  'pharmacy',
  'clothing',
  'electronics',
  'online_shopping',
  'food_delivery',
  'ride_share',
  'cigarettes',
  'fast_food',
  'vape_shop',
  'entertainment',
  'gym',
] as const;

export type MerchantTag = (typeof MERCHANT_TAGS)[number];
