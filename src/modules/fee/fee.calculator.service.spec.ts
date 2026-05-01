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
