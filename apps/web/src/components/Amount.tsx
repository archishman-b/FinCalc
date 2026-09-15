import { formatINR } from '@fincalc/ui';

/** The hero-number component: tabular monospace, Indian grouping. "Numbers are the hero" (brief §5) — every rupee figure in the product should render through this, not a raw template string. */
export function Amount({
  value,
  compact = true,
  className = '',
}: {
  value: number;
  compact?: boolean;
  className?: string;
}) {
  return <span className={`font-mono tabular-nums ${className}`}>{formatINR(value, { compact })}</span>;
}
