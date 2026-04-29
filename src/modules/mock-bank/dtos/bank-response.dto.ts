export interface BankTransactionResponseDto {
  success: boolean;
  bankTransactionId: string;
  merchantTag: string;
  amount: number;
  currency: string;
  occurredAt: string;
}

export interface BankOperationResponseDto {
  success: boolean;
  operationId: string;
  message: string;
}
