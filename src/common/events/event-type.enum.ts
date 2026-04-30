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
}
