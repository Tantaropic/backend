# Architecture Decision Record: Robust Money Handling

**Status:** Accepted
**Context:** Tantaropic Financial Backend

## 1. Context and Problem Statement
Our application handles high-concurrency financial data. To maintain strict sharia-compliance and ledger integrity, we must be absolutely certain that financial calculations are accurate. 
Standard floating-point numbers in JavaScript (`Number`) are prone to precision errors (e.g., `0.1 + 0.2 = 0.30000000000000004`). In addition, raw integers are susceptible to context loss, where a developer might accidentally add "Pounds" to "Piasters", or mix "EGP" with "USD".

## 2. BigInt for Precision
We exclusively use `BigInt` under the hood (mapped to `BigInt` in the Prisma schema and PostgreSQL).
- **Why?** JavaScript's standard `Number.MAX_SAFE_INTEGER` is `9,007,199,254,740,991`. While large, it represents floating-point backing. `BigInt` provides absolute arbitrary precision for integers, guaranteeing no overflow and ensuring no floating-point artifacts ever enter the database.
- **Rule:** We store the absolute smallest unit of a currency (e.g., Piasters for EGP, Cents for USD). There are no decimals in the database.

## 3. The Money Value Object Pattern
To prevent unit ambiguity and enforce strict math, we use a custom `Money` Value Object (`src/common/domain/value-objects/money.vo.ts`).
- **Why?** Passing around raw `bigint` values makes it impossible to know *what* currency or unit it represents. The `Money` object binds a `bigint` amount with a strictly-typed `CurrencyCode` (from our `CurrencyRegistry`).
- **Features:**
  - **Immutability:** Money objects cannot be mutated. Math operations (`add`, `subtract`) return *new* instances.
  - **Type Safety:** You cannot accidentally add `USD` to `EGP`. The `.add()` and `.subtract()` methods will throw an exception if the currencies do not match.
  - **Underflow Protection:** The `.subtract()` method explicitly throws an error if an operation results in a negative balance, protecting the integrity of the ledger.

## 4. The "Oreo Cookie" Method (Embedded Value Pattern)
Since relational databases and REST APIs do not natively understand our custom `Money` class, we use the "Oreo Cookie" pattern:
1. **The Top Cookie (API/Ingestion):** Data enters as raw JSON primitives. DTOs accept raw numbers and immediately map them into `Money` instances using `Money.fromMajorUnit()`.
2. **The Cream (Internal Domain):** Deep within our application (services, engines, math), we **only** pass and manipulate the robust `Money` instances. No raw integers are allowed.
3. **The Bottom Cookie (Prisma/DB):** When saving to the database, we "unwrap" the value object back into flat columns (`amount: BigInt`, `currency: String`). When reading from the database, we immediately "wrap" the raw rows back into `Money` instances at the repository boundary before returning them to the service layer.

This strict boundary ensures the core business logic remains perfectly pure, safe, and easily testable.
