import type { ReactNode } from 'react';

import { navigate, type RouteId } from '../lib/router';

/**
 * Shared page shell for every Tier 1 calculator (Phase 6) — the same
 * back-button / title / footer structure Comparator.tsx and ComingSoon.tsx
 * each hand-rolled in Phase 5, pulled out once a third and fourth page
 * needed it rather than copy-pasted eight times. `back` defaults to the
 * Tier 1 grid (`calculators`) since that's where every one of these pages
 * is reached from; Rent vs Buy overrides it to `home` since it's also
 * door 2, reachable directly from the entry router.
 */
export function CalcShell({
  title,
  subtitle,
  back = 'calculators',
  backLabel = '← All calculators',
  children,
}: {
  title: string;
  subtitle?: string;
  back?: RouteId;
  backLabel?: string;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col px-5 py-10 sm:px-8">
      <button
        type="button"
        onClick={() => navigate(back)}
        className="w-fit text-sm text-ink-muted hover:text-rust focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-rust"
      >
        {backLabel}
      </button>

      <h1 className="mt-8 text-3xl leading-tight text-ink sm:text-4xl">{title}</h1>
      {subtitle && <p className="mt-3 max-w-md text-ink-muted">{subtitle}</p>}

      {children}

      <footer className="mt-16 max-w-md space-y-1 text-sm text-ink-muted">
        <p>Runs entirely in your browser. No backend, no accounts, nothing you enter leaves this page.</p>
        <p>Information, not advice — FinCalc is not SEBI- or IRDAI-registered investment advice.</p>
      </footer>
    </main>
  );
}

/** A labelled numeric input, the exact style Comparator.tsx established — pulled out so eight calculator forms don't each redefine it. */
export function NumberField({
  label,
  hint,
  value,
  onChange,
  min = 0,
  max,
  step = 1000,
  required = true,
}: {
  label: string;
  hint?: string | undefined;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number | undefined;
  step?: number;
  required?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="text-ink">{label}</span>
      <input
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        step={step}
        required={required}
        value={Number.isFinite(value) ? value : ''}
        onChange={(e) => onChange(e.target.value === '' ? NaN : Number(e.target.value))}
        className="rounded-sm border border-hairline bg-paper px-3 py-2 font-mono tabular-nums text-ink"
      />
      {hint && <span className="text-xs text-ink-muted">{hint}</span>}
    </label>
  );
}

/** A labelled select, matching the same visual language. */
export function SelectField<T extends string>({
  label,
  value,
  onChange,
  options,
  hint,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: readonly { value: T; label: string }[];
  hint?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="text-ink">{label}</span>
      <select
        className="rounded-sm border border-hairline bg-paper px-3 py-2 text-ink"
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {hint && <span className="text-xs text-ink-muted">{hint}</span>}
    </label>
  );
}

/** The submit button every calculator form uses. */
export function SubmitButton({ children }: { children: ReactNode }) {
  return (
    <button
      type="submit"
      className="mt-2 w-fit rounded-sm bg-rust px-5 py-2.5 text-paper hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rust"
    >
      {children}
    </button>
  );
}

/** An error/warning banner, matching the Comparator's parity-warning styling. */
export function Callout({ tone = 'warning', children }: { tone?: 'warning' | 'positive'; children: ReactNode }) {
  const cls =
    tone === 'positive'
      ? 'border-moss/40 bg-moss/10'
      : 'border-ochre bg-ochre/10';
  return <p role={tone === 'warning' ? 'alert' : undefined} className={`mt-8 max-w-md rounded-sm border px-4 py-3 text-sm text-ink ${cls}`}>{children}</p>;
}
