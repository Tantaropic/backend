import {
  Inject,
  Injectable,
  NotFoundException,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../database/prisma/prisma.service';
import { LedgerEntryType, Currency, AssetClass } from '../../common/enums';
import { UserRepository } from './user.repository';
import { UpdateUserSettingsDto } from './dtos/update-user-settings.dto';
import { CreateUserForProfileDto } from './dtos/create-user.dto';
import { RiskProfile } from '../../common/enums';
import { Money } from '../../common/domain/value-objects/money.vo';
import { EventType } from '../../common/events';
import { ASSET_UNIT_PRECISION } from '../../common/constants';
import {
  I_EXCHANGE_PROVIDER,
  type IExchangeProvider,
} from '../../common/interfaces/exchange-provider.interface';
import type {
  FundsReadyForInvestmentEventPayload,
  WalletBalanceReconciledEventPayload,
  TradeOrderExecutedEventPayload,
} from '../../common/events/event-payload';
import type { User } from '@prisma/client';

interface SimulateSellInput {
  assetClass: AssetClass;
  units?: bigint;
  amount?: bigint;
}

const USER_DEPOSIT_FEE_BPS = 50;
const SELL_REVENUE_FEE_BPS = 150;

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);
  constructor(
    private readonly userRepo: UserRepository,
    private readonly prisma: PrismaService,
    private readonly eventService: EventEmitter2,
    @Inject(I_EXCHANGE_PROVIDER)
    private readonly exchange: IExchangeProvider,
  ) {}

  /**
   * Returns all users with their associated profile.
   */
  async findAll() {
    return this.userRepo.findAllWithProfile();
  }

  /**
   * Find a single user by ID, including profile and wallet info.
   */
  async findOne(userId: string) {
    const user = await this.userRepo.findByIdWithProfileAndWallet(userId);
    if (!user) throw new NotFoundException(`User ${userId} not found`);
    return user;
  }

  /**
   * Create a new user linked to a profile.
   */
  async create(data: CreateUserForProfileDto): Promise<User> {
    return this.userRepo.createForProfile(data);
  }

  /**
   * Full dashboard snapshot for a single user.
   * Includes profile → wallet → positions and the last `ledgerLimit` ledger entries.
   */
  async getDashboard(userId: string, ledgerLimit = 10) {
    const user = await this.userRepo.findByIdWithDashboard(userId, ledgerLimit);
    if (!user) throw new NotFoundException(`User ${userId} not found`);
    return user;
  }

  /**
   * Update a user's risk profile and / or savings target goal.
   * Only fields that are explicitly provided are updated.
   */
  async updateSettings(
    userId: string,
    settings: UpdateUserSettingsDto,
  ): Promise<User> {
    // Validate targetGoal
    if (settings.targetGoal !== undefined) {
      if (typeof settings.targetGoal !== 'bigint') {
        throw new BadRequestException('Target goal must be a valid number');
      }
      if (settings.targetGoal < 0n) {
        throw new BadRequestException('Target goal must be non-negative');
      }
    }

    // Validate roundUpStep
    if (settings.roundUpStep !== undefined) {
      if (typeof settings.roundUpStep !== 'bigint') {
        throw new BadRequestException('Round-up step must be a valid number');
      }
      if (settings.roundUpStep <= 0n) {
        throw new BadRequestException('Round-up step must be positive');
      }
    }

    return this.userRepo.updateSettings(
      userId,
      settings.riskProfile,
      settings.targetGoal,
      settings.roundUpStep,
    );
  }
  /**
   * Simulates a fiat deposit into the user's shared profile wallet.
   * Creates a LedgerEntry and increments the wallet balance atomically.
   *
   * Uses Optimistic Concurrency Control (OCC) on the wallet version column
   * to prevent double-credit in concurrent scenarios.
   */
  async simulateDeposit(userId: string, amount: bigint) {
    this.logger.log(`Simulating deposit of ${amount} for user ${userId}`);
    if (amount <= 0n) {
      throw new BadRequestException('Deposit amount must be positive');
    }

    const user = await this.userRepo.findByIdWithProfileAndWallet(userId);

    if (!user || !user.profile.wallet) {
      throw new NotFoundException('User or Wallet not found');
    }

    const wallet = user.profile.wallet;
    const depositFee = this.calculateBpsAmount(amount, USER_DEPOSIT_FEE_BPS);
    const netDeposit = amount - depositFee;

    const updatedWallet = await this.prisma.$transaction(
      async (tx) => {
        // 1. Record the deposit in the ledger
        await tx.ledgerEntry.create({
          data: {
            userId: user.id,
            walletId: wallet.id,
            type: LedgerEntryType.USER_DEPOSIT, // enum from common/enums — no magic strings
            amount,
          },
        });

        if (depositFee > 0n) {
          await tx.ledgerEntry.create({
            data: {
              userId: user.id,
              walletId: wallet.id,
              type: LedgerEntryType.FUND_FEE,
              amount: depositFee,
              currency: Currency.EGP,
              idempotencyKey: `deposit-fee-${wallet.id}-${wallet.version}-${Date.now()}`,
              note: JSON.stringify({
                feeType: 'DEPOSIT_FEE',
                bps: USER_DEPOSIT_FEE_BPS,
                grossAmount: amount.toString(),
                feeAmount: depositFee.toString(),
                netAmount: netDeposit.toString(),
              }),
            },
          });
        }

        // 2. Increment fiat balance; OCC check ensures no concurrent version mismatch
        return tx.digitalWallet.update({
          where: {
            id: wallet.id,
            version: wallet.version, // OCC guard
          },
          data: {
            fiatBalance: { increment: netDeposit },
            version: { increment: 1 },
          },
        });
      },
      {
        maxWait: 5000, // Time (ms) to wait to acquire a connection from the pool
        timeout: 10000, // Time (ms) the transaction has to finish once started
      },
    );

    // Emit reconciliation event so downstream services (milestone insights, SSE)
    // see the new balance.
    const reconciledMoney = Money.fromMinorUnit(
      updatedWallet.fiatBalance,
      Currency.EGP,
    );
    const eventPayload: WalletBalanceReconciledEventPayload = {
      timestamp: new Date(),
      userId,
      transactionId: `deposit-${updatedWallet.id}-${updatedWallet.version}`,
      money: reconciledMoney,
    };
    this.eventService.emit(
      EventType.SystemEventType.WALLET_BALANCE_RECONCILED,
      eventPayload,
    );

    // Trigger the investment allocator on the deposited cash. The allocator
    // reads live wallet balance and respects whole-unit constraints, so
    // small deposits that can't buy a whole unit are left as cash.
    const depositMoney = Money.fromMinorUnit(netDeposit, Currency.EGP);
    const fundsReadyPayload: FundsReadyForInvestmentEventPayload = {
      timestamp: new Date(),
      userId,
      walletId: updatedWallet.id,
      transactionId: `deposit-${updatedWallet.id}-${updatedWallet.version}`,
      netAmount: depositMoney,
      idempotencyKey: `deposit-${updatedWallet.id}-${updatedWallet.version}`,
    };
    this.eventService.emit(
      EventType.SystemEventType.FUNDS_READY_FOR_INVESTMENT,
      fundsReadyPayload,
    );

    return updatedWallet;
  }

  async simulateWithdraw(userId: string, amount: bigint) {
    this.logger.log(`Simulating withdrawal of ${amount} for user ${userId}`);
    if (amount <= 0n) {
      throw new BadRequestException('Withdrawal amount must be positive');
    }

    const user = await this.userRepo.findByIdWithProfileAndWallet(userId);
    if (!user || !user.profile.wallet) {
      throw new NotFoundException('User or Wallet not found');
    }

    const wallet = user.profile.wallet;
    if (wallet.fiatBalance < amount) {
      throw new BadRequestException('Insufficient wallet balance');
    }

    const updatedWallet = await this.prisma.$transaction(
      async (tx) => {
        await tx.ledgerEntry.create({
          data: {
            userId: user.id,
            walletId: wallet.id,
            type: LedgerEntryType.USER_WITHDRAWAL,
            amount: -amount,
          },
        });

        return tx.digitalWallet.update({
          where: {
            id: wallet.id,
            version: wallet.version,
          },
          data: {
            fiatBalance: { decrement: amount },
            version: { increment: 1 },
          },
        });
      },
      {
        maxWait: 5000,
        timeout: 10000,
      },
    );

    const reconciledMoney = Money.fromMinorUnit(
      updatedWallet.fiatBalance,
      Currency.EGP,
    );
    const eventPayload: WalletBalanceReconciledEventPayload = {
      timestamp: new Date(),
      userId,
      transactionId: `withdraw-${updatedWallet.id}-${updatedWallet.version}`,
      money: reconciledMoney,
    };
    this.eventService.emit(
      EventType.SystemEventType.WALLET_BALANCE_RECONCILED,
      eventPayload,
    );

    return updatedWallet;
  }

  async simulateSell(userId: string, input: SimulateSellInput) {
    if (!input.assetClass || input.assetClass === AssetClass.FIAT) {
      throw new BadRequestException('A tradeable asset class is required');
    }

    const user = await this.userRepo.findByIdWithProfileAndWallet(userId);
    if (!user || !user.profile.wallet) {
      throw new NotFoundException('User or Wallet not found');
    }

    const wallet = user.profile.wallet;
    const position = wallet.positions.find(
      (p) => p.assetClass === input.assetClass,
    );
    if (!position || position.totalUnits <= 0n) {
      throw new BadRequestException('No position available to sell');
    }

    const latestPrice = await this.exchange.getLatestPrice(input.assetClass);
    if (latestPrice.amount <= 0n) {
      throw new BadRequestException('Asset price is unavailable');
    }

    const requestedUnits = this.resolveSellUnits(input, latestPrice.amount);
    if (requestedUnits <= 0n) {
      throw new BadRequestException('Sell amount must be positive');
    }
    if (requestedUnits > position.totalUnits) {
      throw new BadRequestException('Sell amount exceeds owned units');
    }

    const idempotencyKey = `sell-${wallet.id}-${input.assetClass}-${Date.now()}`;
    const tradeResult = await this.exchange.sellAsset({
      userId,
      assetClass: input.assetClass,
      units: requestedUnits,
      totalCost: Money.fromMinorUnit(0n, Currency.EGP),
      idempotencyKey,
    });

    if (
      !tradeResult.success ||
      tradeResult.executedUnits === undefined ||
      tradeResult.executionPrice === undefined ||
      tradeResult.totalCost === undefined
    ) {
      throw new BadRequestException(
        tradeResult.message ?? 'Sell order was not executed',
      );
    }

    const executedUnits = tradeResult.executedUnits;
    const executionPrice = tradeResult.executionPrice;
    const proceeds = tradeResult.totalCost.amount;
    if (proceeds <= 0n) {
      throw new BadRequestException('Sell proceeds are too small');
    }
    const revenueFee = this.calculateBpsAmount(proceeds, SELL_REVENUE_FEE_BPS);
    const netProceeds = proceeds - revenueFee;
    if (netProceeds <= 0n) {
      throw new BadRequestException('Sell proceeds are too small after fees');
    }

    const updatedWallet = await this.prisma.$transaction(
      async (tx) => {
        const currentWallet = await tx.digitalWallet.findUniqueOrThrow({
          where: { id: wallet.id },
        });
        const currentPosition = await tx.walletPosition.findUniqueOrThrow({
          where: {
            walletId_assetClass: {
              walletId: wallet.id,
              assetClass: input.assetClass,
            },
          },
        });

        if (currentPosition.totalUnits < executedUnits) {
          throw new BadRequestException('Sell amount exceeds owned units');
        }

        const remainingUnits = currentPosition.totalUnits - executedUnits;

        if (remainingUnits === 0n) {
          await tx.walletPosition.delete({ where: { id: currentPosition.id } });
        } else {
          await tx.walletPosition.update({
            where: { id: currentPosition.id },
            data: {
              totalUnits: remainingUnits,
              version: { increment: 1 },
            },
          });
        }

        await tx.ledgerEntry.create({
          data: {
            userId: user.id,
            walletId: wallet.id,
            type: LedgerEntryType.INVESTMENT_REDEMPTION,
            amount: proceeds,
            currency: Currency.EGP,
            assetClass: input.assetClass,
            assetUnits: executedUnits,
            executionPrice: executionPrice.amount,
            idempotencyKey,
            note: JSON.stringify({
              assetClass: input.assetClass,
              grossProceeds: proceeds.toString(),
              feeAmount: revenueFee.toString(),
              netProceeds: netProceeds.toString(),
              units: executedUnits.toString(),
            }),
          },
        });

        if (revenueFee > 0n) {
          await tx.ledgerEntry.create({
            data: {
              userId: user.id,
              walletId: wallet.id,
              type: LedgerEntryType.PROFIT_FEE,
              amount: revenueFee,
              currency: Currency.EGP,
              assetClass: input.assetClass,
              assetUnits: executedUnits,
              executionPrice: executionPrice.amount,
              idempotencyKey: `sell-fee-${idempotencyKey}`,
              note: JSON.stringify({
                feeType: 'SELL_REVENUE_FEE',
                bps: SELL_REVENUE_FEE_BPS,
                assetClass: input.assetClass,
                grossProceeds: proceeds.toString(),
                feeAmount: revenueFee.toString(),
                netProceeds: netProceeds.toString(),
                units: executedUnits.toString(),
              }),
            },
          });
        }

        return tx.digitalWallet.update({
          where: {
            id: currentWallet.id,
            version: currentWallet.version,
          },
          data: {
            fiatBalance: { increment: netProceeds },
            version: { increment: 1 },
          },
        });
      },
      {
        maxWait: 15_000,
        timeout: 20_000,
      },
    );

    const reconciledMoney = Money.fromMinorUnit(
      updatedWallet.fiatBalance,
      Currency.EGP,
    );
    const transactionId = `sell-${updatedWallet.id}-${updatedWallet.version}`;
    const reconciledPayload: WalletBalanceReconciledEventPayload = {
      timestamp: new Date(),
      userId,
      transactionId,
      money: reconciledMoney,
    };
    this.eventService.emit(
      EventType.SystemEventType.WALLET_BALANCE_RECONCILED,
      reconciledPayload,
    );

    const tradePayload: TradeOrderExecutedEventPayload = {
      timestamp: new Date(),
      userId,
      transactionId,
      orderId: tradeResult.transactionId ?? idempotencyKey,
      idempotencyKey,
      asset: input.assetClass,
      assetPrice: executionPrice,
      orderQuantity: executedUnits,
    };
    this.eventService.emit(
      EventType.SystemEventType.TRADE_ORDER_EXECUTED,
      tradePayload,
    );

    return {
      wallet: updatedWallet,
      trade: tradeResult,
      grossProceeds: proceeds,
      fee: revenueFee,
      proceeds: netProceeds,
    };
  }

  private calculateBpsAmount(amount: bigint, bps: number) {
    return (amount * BigInt(bps)) / 10_000n;
  }

  private resolveSellUnits(input: SimulateSellInput, pricePerUnit: bigint) {
    if (input.units !== undefined) {
      return input.units;
    }

    if (input.amount === undefined) {
      throw new BadRequestException('Either units or amount is required');
    }

    if (input.amount <= 0n) {
      throw new BadRequestException('Sell amount must be positive');
    }

    return (
      (input.amount * ASSET_UNIT_PRECISION + pricePerUnit - 1n) / pricePerUnit
    );
  }

  mockIfEmpty(body: Partial<CreateUserForProfileDto>): CreateUserForProfileDto {
    return {
      email: body.email ?? 'test@test.com',
      name: body.name ?? 'test',
      profileId: body.profileId ?? 'test',
      riskProfile: body.riskProfile ?? RiskProfile.DEFAULT,
    };
  }
}
