export interface CollectFundsDto {
  bankTransactionId: string;
  userId: string;
  amount: number;
  currency: string;
  idempotencyKey: string;
}
