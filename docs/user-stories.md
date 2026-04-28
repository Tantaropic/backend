# User Stories

These user stories focus on the expected actions and integrate the fee structures, the 24/75/1 asset allocation, and the multi-user profile baseline.

## Epic 1: The Golden Path (Ingestion & Sweeping)

### 1. Simulate Mock Transaction (Demo UI)

- **As an** Investor or Hackathon Judge,
- **I want to** click a `Simulate Purchase` button,
- **So that** I can trigger a simulated webhook payload to the backend, demonstrating the transaction ingestion flow without needing a live Open Banking connection.

### 2. The Round-Up Engine Processing

- **As the** Round-Up Engine,
- **I want to** intercept incoming transactions and calculate the spare change round-up to the nearest fraction,
- **So that** the system can isolate the exact fiat amount to be converted into an investment.

### 3. The Fee Engine (Fund & Profit)

- **As the** Fee Engine,
- **I want to** evaluate the profile's active tier to deduct the 0.5% `FUND_FEE` on new deposits, and calculate the 1.5% profit fee, taking the fees against profit when the user do withdrawals,
- **So that** the platform properly monetizes the service while adhering to the Mudarabah profit-sharing principles.

### 4. Asset Allocation (The 24/75/1 Rule)

- **As the** Asset Allocator,
- **I want to** automatically distribute the net swept funds into Gold (24%), Index Funds (75%), and High-Risk Stocks (1%),
- **So that** the digital wallet immediately reflects the Sharia-compliant, optimized risk profile for long-term growth.

## Epic 2: Shared Profiles & Wealth Management

### 5. Multi-User Profile Aggregation

- **As a** Family Member or Friend in a shared profile,
- **I want to** have my individual bank transactions trigger sweeps that route into the shared digital wallet,
- **So that** our group can build collective wealth and reach shared financial goals faster.

### 6. Manual Seeding (Top-Ups)

- **As an** Investor,
- **I want to** manually deposit to invest more money,
- **So that** I can boost the portfolio's compounding power outside of my daily automated round-ups.

### 7. Harvesting (Withdrawal)

- **As an** Investor,
- **I want to** withdraw a specific amount from the shared or personal portfolio,
- **So that** the system liquidates the proportional assets, deducts the 1.5% of profit from the untaxed gains, and simulates routing the money back to my bank.

## Epic 3: The Dashboard & Real-Time Feedback

### 8. Real-Time UI Updates

- **As an** Investor,
- **I want to** watch my dashboard charts and balances update dynamically via SSE,
- **So that** I experience an immediate feedback loop and a dopamine hit every time a sweep or market shift occurs.

### 9. Portfolio Dashboard

- **As an** Investor,
- **I want to** see my current net money, holdings breakdown (Gold, Index Fund, High-Risk), total profit, and fees paid,
- **So that** I clearly understand how my investments are performing at current market prices.

## Epic 4: The AI Analyst & Emotional Engagement

### 10. Habit Identification

- **As the** AI Emotional Engine,
- **I want to** parse the merchant tags from the transaction feed,
- **So that** I can identify recurring spending patterns that represent financial leaks or bad habits.

### 11. Generating Emotional Nudges

- **As an** Investor,
- **I want to** receive personalized, AI-generated insights regarding my spending,
- **So that** I clearly understand the long-term opportunity cost of my daily habits and feel encouraged to invest that money instead.