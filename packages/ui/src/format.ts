/**
 * Indian number formatting: ₹12,34,567 with lakh/crore grouping, never
 * 1,234,567. Hand-rolled rather than Intl('en-IN') so output is identical in
 * every browser, in Node tests, and later in React Native.
 */

const LAKH = 1_00_000;
const CRORE = 1_00_00_000;

export interface FormatINROptions {
  /** ₹1.23Cr / ₹12.5L instead of the full grouped figure. Values below one lakh are always shown in full. */
  compact?: boolean;
  /** Fraction digits. Full mode defaults to 0 (whole rupees); compact mode defaults to 2 with trailing zeros trimmed. */
  decimals?: number;
  /** Prefix positive values with "+" (useful in deltas and waterfalls). */
  signed?: boolean;
}

/** Groups the integer part of a non-negative number string Indian-style: 1234567 → 12,34,567. */
export function groupIndian(integerDigits: string): string {
  if (integerDigits.length <= 3) return integerDigits;
  const last3 = integerDigits.slice(-3);
  const rest = integerDigits.slice(0, -3);
  const pairs: string[] = [];
  for (let i = rest.length; i > 0; i -= 2) pairs.unshift(rest.slice(Math.max(0, i - 2), i));
  return `${pairs.join(',')},${last3}`;
}

/** Formats a rupee amount with Indian grouping. Non-finite input renders as an em dash. */
export function formatINR(value: number, options: FormatINROptions = {}): string {
  if (!Number.isFinite(value)) return '—';
  const { compact = false, signed = false } = options;
  const negative = value < 0 || Object.is(value, -0);
  const abs = Math.abs(value);
  const sign = negative && abs !== 0 ? '-' : signed && abs !== 0 ? '+' : '';

  if (compact && abs >= LAKH) {
    const decimals = options.decimals ?? 2;
    let [divisor, suffix] = abs >= CRORE ? [CRORE, 'Cr'] : [LAKH, 'L'];
    // ₹99,99,999.9 rounds to 100.00L; promote it to ₹1Cr rather than print a 3-digit lakh figure.
    if (suffix === 'L' && Number((abs / LAKH).toFixed(decimals)) >= 100) [divisor, suffix] = [CRORE, 'Cr'];
    const scaled = trimZeros((abs / divisor).toFixed(decimals));
    return `${sign}₹${scaled}${suffix}`;
  }

  const decimals = options.decimals ?? 0;
  const fixed = abs.toFixed(decimals);
  const [intPart = '0', fracPart] = fixed.split('.');
  const grouped = groupIndian(intPart);
  return `${sign}₹${fracPart ? `${grouped}.${fracPart}` : grouped}`;
}

/** Formats a plain number (no currency) with Indian grouping, e.g. square feet or units. */
export function formatIndianNumber(value: number, decimals = 0): string {
  if (!Number.isFinite(value)) return '—';
  const negative = value < 0;
  const [intPart = '0', fracPart] = Math.abs(value).toFixed(decimals).split('.');
  const grouped = groupIndian(intPart);
  return `${negative ? '-' : ''}${fracPart ? `${grouped}.${fracPart}` : grouped}`;
}

function trimZeros(fixed: string): string {
  return fixed.includes('.') ? fixed.replace(/\.?0+$/, '') : fixed;
}
