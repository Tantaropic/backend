# External Interfaces

Our integration with external providers (such as banks and exchanges) is governed by strict **Anti-Corruption Layer (ACL)** policies. 
We define our external expectations via Ports (`I_BANK_PROVIDER`, `I_EXCHANGE_PROVIDER`) inside `src/common/interfaces`.

## 1. MockBankAPI

`MockBankAPI` represents the source of truth for user funds. It triggers the webhook when a purchase occurs with transaction data and supports simulated fund collection requests.
Our internal `BankIntegrationService` translates these external requests into our internal domain logic (e.g. converting `amount` and `currency` into `Money` Value Objects).

## 2. MockExchangeAPI

`MockExchangeAPI` represents the market. It provides the current valuation multipliers for Gold, Index Funds, and High-Risk stocks during time simulations.
Because BigInt values are not natively supported in standard JSON, our integration uses the `StringifiedJSON` strategy. 
Large values like `amount` or `price` are transmitted as Strings across HTTP to the MockExchange, and then cleanly converted back to `BigInt` via `class-transformer` inside our DTOs before touching the Domain logic.

## 3. Dependency Injection

We use abstract injection tokens (`I_BANK_PROVIDER`, `I_EXCHANGE_PROVIDER`) so the core application logic never knows it is communicating with the `MockBankService` or `MockExchangeService`. 
During NestJS bootstrapping, the integration modules alias these tokens to their respective service implementations.