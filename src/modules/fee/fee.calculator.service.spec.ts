import { Money } from '../../common/domain/value-objects/money.vo';
import { Currency } from '../../common/enums';
import { FeeCalculatorService } from './fee.calculator.service';

describe('FeeCalculatorService - FUND_FEE', () => {
  const calc = new FeeCalculatorService();

  it('applies 0.5% on gross 1000 piasters when AUM=0', () => {
    const gross = Money.fromSmallestUnit(1000n, Currency.EGP);
    const { bps, fee, net } = calc.calculateFundFee(gross, 0n);
    expect(bps).toBe(50);
    expect(fee.amount).toBe(5n);
    expect(net.amount).toBe(995n);
  });

  it('drops to 0.4% bracket once AUM crosses 1,000 USD threshold', () => {
    const gross = Money.fromSmallestUnit(1000n, Currency.EGP);
    const aumOver1k = 1_000n * 100n + 1n;
    expect(calc.calculateFundFee(gross, aumOver1k).bps).toBe(40);
  });

  it('rounds in user favor (sub-piaster fees floor to 0)', () => {
    const gross = Money.fromSmallestUnit(1n, Currency.EGP);
    const { fee } = calc.calculateFundFee(gross, 0n);
    expect(fee.amount).toBe(0n); // 1 * 50 / 10_000 = 0
  });
});

describe('FeeCalculatorService - PROFIT_FEE (WAC)', () => {
  const calc = new FeeCalculatorService();

  it('computes proceeds, costOfSold, realizedProfit when in profit', () => {
    // 10 units sold at 200, average buy was 150 -> profit per unit = 50, total = 500
    const { proceeds, costOfSold, realizedProfit } =
      calc.calculateRealizedProfit({
        units: 10n,
        executionPrice: Money.fromSmallestUnit(200n, Currency.EGP),
        averageBuyPrice: 150n,
      });
    expect(proceeds.amount).toBe(2000n);
    expect(costOfSold.amount).toBe(1500n);
    expect(realizedProfit.amount).toBe(500n);
  });

  it('clamps realizedProfit to zero when sold below cost (no negative profit)', () => {
    const { realizedProfit } = calc.calculateRealizedProfit({
      units: 10n,
      executionPrice: Money.fromSmallestUnit(100n, Currency.EGP),
      averageBuyPrice: 150n,
    });
    expect(realizedProfit.amount).toBe(0n);
  });

  it('applies 1.5% on small profits', () => {
    const profit = Money.fromSmallestUnit(10_000n, Currency.EGP);
    const { bps, fee } = calc.calculateProfitFee(profit);
    expect(bps).toBe(150);
    expect(fee.amount).toBe(150n); // 10_000 * 150 / 10_000
  });

  it('drops to 1.4% bracket once profit crosses 10k USD threshold', () => {
    const profit = Money.fromSmallestUnit(10_000n * 100n + 1n, Currency.EGP);
    expect(calc.calculateProfitFee(profit).bps).toBe(140);
  });

  it('returns zero fee when realizedProfit is zero', () => {
    const profit = Money.fromSmallestUnit(0n, Currency.EGP);
    const { fee } = calc.calculateProfitFee(profit);
    expect(fee.amount).toBe(0n);
  });
});
