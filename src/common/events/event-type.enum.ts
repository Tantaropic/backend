export enum SystemEventType {
  // Wallet Domain
  WALLET_FUNDS_ROUNDUP = 'wallet.funds_roundup',
  WALLET_FUNDS_DEPOSIT = 'wallet.funds_deposit',
  WALLET_WITHDRAWAL = 'wallet.withdrawal',
  WALLET_BALANCE_RECONCILED = 'wallet.balance_reconciled',

  // Trade/Exchange Domain
  TRADE_ORDER_EXECUTED = 'trade.order_executed',
  ASSET_PRICE_CHANGED = 'exchange.price_changed',

  // Bank Domain
  BANK_TRANSACTION_WEBHOOK_RECEIVED = 'bank.transaction_webhook_received',

  // AI Domain
  AI_INSIGHT_GENERATED = 'ai.insight_generated',
  ROUNDUP_DEBITED = 'roundup.debited',
  FUNDS_READY_FOR_INVESTMENT = 'funds.ready_for_investment',
  WITHDRAWAL_REQUESTED = 'withdrawal.requested',
  WITHDRAWAL_FEE_APPLIED = 'withdrawal.fee_applied',
  WALLET_VALUE_PROJECTED = 'wallet.value_projected',
}
