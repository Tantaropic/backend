# Entities

## Domain Concepts

- **Admin:** Ignored for now.
- **User**: Individual member of a family or profile.
- **Profile**: The aggregate root for a tenant workspace (e.g., family unit). owns the wallet.
- **Transaction:** Mocked; comes from the fake bank API.
- **Sweep:** The specific event that triggers calculation and movement of round-ups.
- **Redemption:** Selling assets and moving funds back to the user's bank.
- **AssetAllocation:** Placing money into a stock or fund.
- **InboundTransfer:** User manually adding money.
- **AI_Insight:** Generated user-facing investment or habit insight.

## Data Models / Database Tables (PostgreSQL)

These represent the state and history of the system. All tables live in **Neon PostgreSQL**. Financial operations use ACID transactions to guarantee consistency. Instead of creating separate tables for every type of money movement, use a unified `AccountActivity` with a `Type` field to maintain a clean, double-entry accounting standard.

- **User:** Stores demographics, target goals, risk profile, and total AUM. FK → `Profile`. Linked to a specific profile but shares the same `DigitalWallet` via the profile relationship.
- **Profile:** The aggregate root. Each profile has many users. Ownership parent for the `DigitalWallet`.
- **TransactionEvent:** The raw webhook payload saved directly from the `MockBankAPI`; contains merchant tag, amount, and timestamp. FK → `User`. Stored as a strongly-typed row with a `jsonb` column for the raw payload.
- **DigitalWallet (Portfolio):** Tracks the user's current holdings and values for each specific asset class: Fiat, Gold, Index Fund, and High-Risk. FK → `Profile`. Uses `SELECT ... FOR UPDATE` during withdrawals to prevent overdraw race conditions.
- **AccountActivity:** A unified record of all financial movements. FK → `User`, FK → `DigitalWallet`. Includes a `Type` enum:
  - `SWEEP`: The automated round-up movement.
  - `INBOUND_TRANSFER`: User manually adding funds, also called seeding.
  - `ASSET_ALLOCATION`: Placing fiat into the specific stocks or funds.
  - `REDEMPTION`: Withdrawing funds back to the user's bank, also called harvesting.
  - `FUND_FEE`: Recording the platform or success fees taken.
- **AI_Insight:** The generated emotional message, linked to the trigger event, such as a specific transaction or a yearly growth milestone. FK → `User`, optional FK → `TransactionEvent`.