import { describe, expect, it } from 'vitest';

import { formatINR, formatIndianNumber, groupIndian } from './format';

describe('groupIndian', () => {
  it.each([
    ['0', '0'],
    ['999', '999'],
    ['1000', '1,000'],
    ['12345', '12,345'],
    ['123456', '1,23,456'],
    ['1234567', '12,34,567'],
    ['28000000', '2,80,00,000'],
    ['123456789012', '1,23,45,67,89,012'],
  ])('%s → %s', (input, expected) => {
    expect(groupIndian(input)).toBe(expected);
  });
});

describe('formatINR', () => {
  it('groups in lakhs and crores, never thousands', () => {
    expect(formatINR(1_234_567)).toBe('₹12,34,567');
    expect(formatINR(28_000_000)).toBe('₹2,80,00,000');
    expect(formatINR(1_50_000)).toBe('₹1,50,000');
  });

  it('rounds to whole rupees by default and keeps paise on request', () => {
    expect(formatINR(1234.56)).toBe('₹1,235');
    expect(formatINR(1234.5, { decimals: 2 })).toBe('₹1,234.50');
  });

  it('handles zero, negatives and signed deltas', () => {
    expect(formatINR(0)).toBe('₹0');
    expect(formatINR(-0)).toBe('₹0');
    expect(formatINR(-1_23_456)).toBe('-₹1,23,456');
    expect(formatINR(27_000, { signed: true })).toBe('+₹27,000');
    expect(formatINR(-27_000, { signed: true })).toBe('-₹27,000');
  });

  it('compact mode uses L and Cr with trailing zeros trimmed', () => {
    expect(formatINR(1_00_000, { compact: true })).toBe('₹1L');
    expect(formatINR(12_34_567, { compact: true })).toBe('₹12.35L');
    expect(formatINR(2_80_00_000, { compact: true })).toBe('₹2.8Cr');
    expect(formatINR(1_23_45_67_890, { compact: true })).toBe('₹123.46Cr');
    expect(formatINR(-2_00_00_000, { compact: true })).toBe('-₹2Cr');
    expect(formatINR(99_99_999.9, { compact: true })).toBe('₹1Cr');
  });

  it('compact mode leaves sub-lakh values in full', () => {
    expect(formatINR(99_999, { compact: true })).toBe('₹99,999');
  });

  it('renders non-finite input as an em dash', () => {
    expect(formatINR(Number.NaN)).toBe('—');
    expect(formatINR(Number.POSITIVE_INFINITY)).toBe('—');
  });
});

describe('formatIndianNumber', () => {
  it('groups plain numbers without a currency sign', () => {
    expect(formatIndianNumber(1800)).toBe('1,800');
    expect(formatIndianNumber(1_23_456.789, 1)).toBe('1,23,456.8');
    expect(formatIndianNumber(-4500)).toBe('-4,500');
  });
});
