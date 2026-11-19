import Decimal from 'break_infinity.js';
import type { DecimalString, NumberNotation } from '@/types/game';

export { Decimal };

const STANDARD_SUFFIXES = ['', 'K', 'M', 'B', 'T'];

/**
 * Generates alphabetic suffixes after Trillion:
 * index 5 -> 'aa', 6 -> 'ab', ..., 30 -> 'az', 31 -> 'ba', etc.
 */
function getAlphabeticSuffix(tier: number): string {
  if (tier < STANDARD_SUFFIXES.length) {
    return STANDARD_SUFFIXES[tier];
  }
  let idx = tier - STANDARD_SUFFIXES.length;
  const first = Math.floor(idx / 26);
  const second = idx % 26;
  const aCode = 'a'.charCodeAt(0);
  if (first < 26) {
    return String.fromCharCode(aCode + first) + String.fromCharCode(aCode + second);
  }
  // Beyond 'zz' fall back cleanly to 3-letter code
  const c0 = Math.floor(idx / (26 * 26)) % 26;
  const c1 = Math.floor(idx / 26) % 26;
  const c2 = idx % 26;
  return (
    String.fromCharCode(aCode + c0) +
    String.fromCharCode(aCode + c1) +
    String.fromCharCode(aCode + c2)
  );
}

export function d(value: Decimal | DecimalString | number): Decimal {
  if (value instanceof Decimal) return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return new Decimal(0);
    return new Decimal(value);
  }
  try {
    const parsed = new Decimal(value);
    if (Number.isNaN(parsed.mantissa) || Number.isNaN(parsed.exponent)) {
      return new Decimal(0);
    }
    return parsed;
  } catch {
    return new Decimal(0);
  }
}

export function serializeDecimal(value: Decimal): DecimalString {
  if (value.lt(0) || Number.isNaN(value.mantissa)) return '0';
  return value.toString();
}

export function clampNonNegative(value: Decimal): Decimal {
  return value.lt(0) ? new Decimal(0) : value;
}

export function formatMoney(
  raw: Decimal | DecimalString | number,
  notation: NumberNotation = 'alphabetic',
  prefix = '$',
): string {
  const val = clampNonNegative(d(raw));
  if (val.lt(1000)) {
    const n = val.toNumber();
    if (n < 10 && n > 0 && Math.abs(n - Math.round(n)) > 0.04) {
      return `${prefix}${n.toFixed(1)}`;
    }
    return `${prefix}${Math.floor(n)}`;
  }

  if (notation === 'scientific') {
    const exp = Math.floor(val.log10());
    const mantissa = val.div(Decimal.pow(10, exp)).toNumber();
    return `${prefix}${mantissa.toFixed(2)}e${exp}`;
  }

  const exp = Math.floor(val.log10());
  const tier = Math.floor(exp / 3);
  const scaled = val.div(Decimal.pow(10, tier * 3)).toNumber();
  const suffix = getAlphabeticSuffix(tier);
  const formatted = scaled >= 100 ? scaled.toFixed(0) : scaled >= 10 ? scaled.toFixed(1) : scaled.toFixed(2);
  return `${prefix}${formatted}${suffix}`;
}

export function formatCount(
  raw: Decimal | DecimalString | number,
  notation: NumberNotation = 'alphabetic',
): string {
  return formatMoney(raw, notation, '');
}

export function compareDecimals(a: DecimalString | Decimal, b: DecimalString | Decimal): number {
  return d(a).cmp(d(b));
}
