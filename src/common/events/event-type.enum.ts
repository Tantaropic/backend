export enum SystemEventType {
  // Bank Domain
  BANK_TRANSACTION_WEBHOOK_RECEIVED = 'bank.transaction_webhook_received', // Listener: Roundup

  // Roundup
  WALLET_FUNDS_ROUNDUP = 'wallet.funds_roundup', // Listener: Fee

  // Fee
  FUNDS_READY_FOR_INVESTMENT = 'funds.ready_for_investment', // Listener: Investment

  // Wallet Domain
  WALLET_FUNDS_DEPOSIT = 'wallet.funds_deposit', // Listener: Fee
  WALLET_BALANCE_RECONCILED = 'wallet.balance_reconciled', // Listener: AI
  WITHDRAWAL_COMPLETED = 'withdrawal.completed', // Listener: Fee

  // Trade/Exchange/Investment Domain
  TRADE_ORDER_EXECUTED = 'trade.order_executed',
  INVESTMENT_REDEMPTION_REQUESTED = 'investment.redemption_requested', // !!
  INVESTMENT_REDEMPTION_COMPLETED = 'investment.redemption_completed', // !!
  ASSET_PRICE_CHANGED = 'exchange.price_changed',

  // AI Domain
  AI_INSIGHT_GENERATED = 'ai.insight_generated',
  ROUNDUP_DEBITED = 'roundup.debited',
  WITHDRAWAL_REQUESTED = 'withdrawal.requested',
  WITHDRAWAL_FEE_APPLIED = 'withdrawal.fee_applied',
  WALLET_VALUE_PROJECTED = 'wallet.value_projected',
}
