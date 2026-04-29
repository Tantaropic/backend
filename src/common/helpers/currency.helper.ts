import { Currency } from '../enums';

export function toSmallestUnit(amount: number, currency: Currency) {
  if (currency === Currency.EGP) {
    return Math.round(amount * 100);
  }
}

export function fromSmallestUnit(amount: number, currency: Currency) {
  if (currency === Currency.EGP) {
    return amount / 100;
  }
}

export function toBigInt(amount: number, currency: Currency) {
  if (currency === Currency.EGP) {
    return BigInt(Math.round(amount * 100));
  }
}

export function fromBigInt(amount: bigint, currency: Currency) {
  if (currency === Currency.EGP) {
    return Number(amount) / 100;
  }
}

export function calculateBps(amount: bigint, bps: number, currency: Currency) {
  if (currency === Currency.EGP) {
    return (amount * BigInt(bps)) / BigInt(10000);
  }
}
