export interface DepositFundsDto {
  userId: string;
  amount: number;
  currency: string;
  idempotencyKey: string;
}
