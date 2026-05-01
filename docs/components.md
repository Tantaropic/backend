# Components

These are the active workers and controllers in the NestJS/Node backend that execute the logic. Deployed on **Azure Container Apps** (Consumption plan, free tier).

## Product Areas

- User profile
- Profiles (Aggregate Root / Tenant Management)
- Dashboard
- Our investments fund/wallet

## Services / Background Engines

- **Online Open Bank API**
  - **Webhook Gateway:** Exposes the endpoint to receive and validate the raw data from the `MockBankAPI`.
  - **Funds Collection API:** Creates an endpoint that acts on behalf of the user and takes fractional funds from the `MockBankAPI`.
- **Round-Up Engine:** Listens for new transactions, calculates the spare change round-up, and triggers the fee calculator.
- **Fee Engine:** Checks the user's tier to calculate the 0.5% to 0.01% platform fee on sweeps, and calculates the 1.5% success fee on annual profit milestones.
- **Asset Allocator:** Takes the net swept funds and distributes them into the user's portfolio according to their risk profile, such as the 24% Gold, 75% Index Fund, and 1% High-Risk split.
- **AI Emotional Engine:** Monitors transaction habits, such as spending on cigarettes, and portfolio growth. It feeds this data into an **Azure OpenAI** LLM prompt to generate personalized, encouraging nudges.
- **SSE Service:** Manages the Server-Sent Events connection to push live balance updates, price changes, new charts, and AI messages instantly to the frontend.
- **Price Feed Service:** Periodically fetches current market valuations from the `MockExchangeAPI` (Gold, Index Funds, High-Risk), updates all `DigitalWallet` holdings with the latest prices, and broadcasts the updated values via SSE.

## External Dependencies

- **MockBankAPI:** Mocked external source of transaction and fund movement data.
- **MockExchangeAPI:** Mocked external source of market valuation data.