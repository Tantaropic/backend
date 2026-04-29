# Tantaropic Backend

Sharia-compliant micro-investment platform that turns spare change from everyday purchases into a diversified portfolio of Gold (24%), Index Funds (75%), and High-Risk Stocks (1%).

## How It Works

1. **Bank purchase happens** → MockBankAPI sends a webhook
2. **Round-Up Engine** calculates spare change ($4.30 → $0.70)
3. **Fee Engine** deducts 0.5% platform fee
4. **Asset Allocator** splits net amount across Gold/Index/HighRisk
5. **SSE Service** pushes live updates to the dashboard
6. **AI Emotional Engine** sends personalized spending nudges via Azure OpenAI

## Tech Stack

| Layer | Technology |
| --- | --- |
| Runtime | NestJS (Node.js) |
| Database | Neon PostgreSQL |
| AI / LLM | Azure OpenAI |
| Hosting | Azure Container Apps (free tier) |
| Telemetry | Azure Application Insights (free 5GB) |
| Real-time | Server-Sent Events (SSE) |


## Services

| Service | Purpose |
| --- | --- |
| Webhook Gateway | Receives bank transaction webhooks |
| Funds Collection API | Debits round-up from user's bank |
| Round-Up Engine | Calculates spare change |
| Fee Engine | Applies fund fees (0.5%) and profit fees (1.5%) |
| Asset Allocator | Splits funds into Gold/Index/HighRisk |
| SSE Service | Real-time push to frontend |
| Price Feed Service | Fetches market prices, updates wallets |
| AI Emotional Engine | Generates spending nudges via Azure OpenAI |

## Documentation

- [Developer Guidelines](DEVELOPER_GUIDELINES.md) - **Start here.** Core patterns (Oreo Cookie, OCC, BPS).
- [Core Features Index](core-features.md) - Detailed index of all feature docs.
- [Entities & Schema](entities.md) - Database models and relationships.
- [Fees & Logic](fees.md) - Precision fee calculation rules.