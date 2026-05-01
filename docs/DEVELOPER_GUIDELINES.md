# Tantaropic Developer Guidelines

This document outlines the architectural patterns, coding standards, and guidelines for the Tantaropic backend.

## 1. The "Oreo Cookie" Architecture (Financial Precision)

We use the **Oreo Cookie** pattern for all financial data to ensure absolute precision and Sharia compliance:

- **Bottom Layer (DB)**: Money is stored as `BigInt` (smallest unit, e.g., Piasters) in PostgreSQL. We avoid `Decimal` or `Float` to prevent rounding errors.
- **Middle Layer (Domain)**: Business logic strictly uses the `Money` Value Object (VO).
- **Top Layer (API)**: Data is exchanged via DTOs. Financial values are wrapped/unwrapped at the repository level.

**Rules:**

- **No Raw Math**: Never perform arithmetic on raw numbers or BigInts outside the `Money` VO. Use `Money.add()`, `Money.subtract()`, `money.add()`, `money.subtract()`, and `money.add()`.
- **Registry Driven**: Use `CurrencyRegistry` to handle multipliers (e.g., 100 for EGP).

## 2. Repository Pattern & ACL

The Repository layer acts as an **Anti-Corruption Layer (ACL)** between the database (Prisma) and our Domain logic.

- **BaseRepository**: An abstract class in `src/common/repositories` that provides generic CRUD and encapsulates Prisma delegates.
- **Specific Repositories**: These are responsible for the "wrap/unwrap" logic:
  - `save(money)`: Unwraps the `Money` VO to its `BigInt` amount for storage.
  - `find()`: Wraps raw `BigInt` rows back into Domain-safe `Money` instances.

## 3. Concurrency Control (OCC)

To prevent race conditions during high-concurrency operations (e.g., simultaneous trades or sweeps), we implement **Optimistic Concurrency Control (OCC)**.

- The `DigitalWallet` model includes a `version` column.
- Updates must verify the version: `WHERE id = :id AND version = :currentVersion`.
- The version is incremented on every successful update.

## 4. Basis Points (BPS) for Rates

All platform rates, including fees and asset allocations, are defined using **Basis Points** (where 100 BPS = 1%).

- `ALLOCATION_GOLD_BPS = 2400` (24%)
- `FUND_FEE_BPS = 50` (0.5%)

## 5. Standard Response Contract

All API responses must follow the project's standard envelope:

- **Success**: Use the `ok()` helper from `src/common/helpers/response.helper.ts`.
- **Error**: Errors are automatically caught and formatted by the `GlobalExceptionFilter` using the `ErrorCode` enum.

## 6. Directory Structure

- `src/modules`: Feature-specific modules (e.g., `ledger`, `wallet`).
- `src/common`: Shared infrastructure, including `domain` (VOs), `repositories` (Base), and `constants`.
- `src/database`: Prisma integration and configuration.

## 7. Global API Routing

All internal and integration endpoints must sit behind the global `api/v1` prefix. This is configured in `src/main.ts` using `app.setGlobalPrefix('api/v1')`.

## 8. Event-Driven Architecture

The platform uses `@nestjs/event-emitter` to decouple modules. 
Events and their payload structures are strictly typed in `src/common/events`.
When cross-domain reactions are required (e.g. `BankIntegrationService` receiving a webhook that must trigger the `Ledger`), the initiating service emits a strongly-typed event (`EventType.SystemEventType.BANK_TRANSACTION_WEBHOOK_RECEIVED`) rather than injecting the target service directly.

## 9. Ledger & Double-Entry Accounting

To ensure an immutable audit trail and prevent discrepancies, all financial movements must use a double-entry style accounting system implemented within a single ACID transaction.

**Example: User Deposit Workflow**
When a user deposits funds (e.g., via a bank webhook), the following steps must be executed atomically:

1. **TransactionEvent (Optional):** Record the raw webhook payload in the `TransactionEvent` table for tracing.
2. **Ledger Entries (The Audit Trail):** Insert two distinct rows into the `LedgerEntry` table to properly account for fees:
   - **Gross Deposit:** `type: USER_DEPOSIT`, `amount: +[Gross Amount]`
   - **Fee Deduction:** `type: FUND_FEE`, `amount: -[Fee Amount]`
3. **Digital Wallet Update (The State):** Update the user's `DigitalWallet.fiatBalance` by adding the *net* amount (Gross - Fee). This step must utilize **Optimistic Concurrency Control (OCC)** via the `version` field.

This separation ensures that a user's current wallet balance can always be recalculated and verified by summing their historical ledger entries.

## 10. Profile as Aggregate Root

The `Profile` entity serves as the **Aggregate Root** for a tenant workspace (e.g., a family unit). 
- A `Profile` owns a single `DigitalWallet`.
- A `Profile` can have multiple `User` members.
- Initialization of these entities must be **atomic**.

## 11. Atomic Bootstrapping

When creating a new "Family" or "Profile", we must ensure that the `Profile`, its shared `DigitalWallet`, and the initial `User` are created within a single transaction.

- **Service Layer**: `ProfilesService` orchestrates the creation.
- **Repository Layer**: `ProfileRepository.createProfileWithWalletAndUser` implements the nested Prisma transaction.
- **Logic**: 
  1. Create `Profile` and `DigitalWallet`.
  2. Create `User` linked to the new `Profile`.
  3. Return the fully initialized aggregate.

This prevents "half-baked" state where a user exists without a wallet or a profile exists without a user.
