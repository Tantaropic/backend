# External Interfaces

## MockBankAPI

`MockBankAPI` represents the source of truth for user funds. It triggers the webhook when a purchase occurs with transaction data and supports simulated fund collection requests.

## MockExchangeAPI

`MockExchangeAPI` represents the market. It provides the current valuation multipliers for Gold, Index Funds, and High-Risk stocks during time simulations.