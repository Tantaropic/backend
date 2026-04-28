/*
  Warnings:

  - You are about to drop the `User` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "LedgerEntryType" AS ENUM ('SWEEP', 'INBOUND_TRANSFER', 'ASSET_ALLOCATION', 'REDEMPTION', 'FUND_FEE', 'YEARLY_PROFIT_FEE');

-- CreateEnum
CREATE TYPE "AssetClass" AS ENUM ('FIAT', 'GOLD', 'INDEX_FUND', 'HIGH_RISK');

-- CreateEnum
CREATE TYPE "RiskProfile" AS ENUM ('DEFAULT', 'CONSERVATIVE', 'AGGRESSIVE');

-- DropTable
DROP TABLE "User";

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "riskProfile" "RiskProfile" NOT NULL DEFAULT 'DEFAULT',
    "aum" DECIMAL(18,8) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transaction_events" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "merchantTag" TEXT NOT NULL,
    "amount" DECIMAL(18,8) NOT NULL,
    "roundUpAmount" DECIMAL(18,8) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'LE',
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transaction_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "digital_wallets" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fiatBalance" DECIMAL(18,8) NOT NULL DEFAULT 0,
    "goldBalance" DECIMAL(18,8) NOT NULL DEFAULT 0,
    "indexBalance" DECIMAL(18,8) NOT NULL DEFAULT 0,
    "highRiskBalance" DECIMAL(18,8) NOT NULL DEFAULT 0,
    "totalValue" DECIMAL(18,8) NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "digital_wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_entries" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "LedgerEntryType" NOT NULL,
    "amount" DECIMAL(18,8) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'LE',
    "assetClass" "AssetClass",
    "transactionEventId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_insights" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "triggerTag" TEXT,
    "triggerEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_insights_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "transaction_events_userId_idx" ON "transaction_events"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "digital_wallets_userId_key" ON "digital_wallets"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_entries_transactionEventId_key" ON "ledger_entries"("transactionEventId");

-- CreateIndex
CREATE INDEX "ledger_entries_userId_idx" ON "ledger_entries"("userId");

-- CreateIndex
CREATE INDEX "ledger_entries_type_idx" ON "ledger_entries"("type");

-- CreateIndex
CREATE INDEX "ai_insights_userId_idx" ON "ai_insights"("userId");

-- AddForeignKey
ALTER TABLE "transaction_events" ADD CONSTRAINT "transaction_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "digital_wallets" ADD CONSTRAINT "digital_wallets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_transactionEventId_fkey" FOREIGN KEY ("transactionEventId") REFERENCES "transaction_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_insights" ADD CONSTRAINT "ai_insights_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
