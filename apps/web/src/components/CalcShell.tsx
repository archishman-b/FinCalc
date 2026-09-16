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
 *
 * Phase 9.1 (user feedback, viewing the live site on a desktop monitor:
 * "too textual... only uses a third of the on-screen real estate, it
 * needs to scale well across devices"): the form and its result are now
 * two explicit slots — `form` and `children` — instead of one `children`
 * blob stacked top-to-bottom. Below `lg` they still stack exactly as
 * before (form, then result). From `lg` up they sit side by side in a
 * fixed-width-form / flexible-result grid, with the form `sticky` so it
 * stays reachable while a long result — a chart, a table, a Monte Carlo
 * panel — scrolls underneath it. This is the one change that fixes every
 * calculator's use of screen space at once, since all eight Tier 1 pages
 * plus Rent vs Buy share this shell; Comparator.tsx applies the same
 * grid by hand since it pre-dates CalcShell and has its own saved-
 * scenarios panel above the form.
 */
export function CalcShell({
  title,
  subtitle,
  back = 'calculators',
  backLabel = '← All calculators',
  form,
  children,
}: {
  title: string;
  subtitle?: string;
  back?: RouteId;
  backLabel?: string;
  form: ReactNode;
  children?: ReactNode;
}) {
  return (
    <main className="mx-auto min-h-dvh max-w-[1440px] px-5 py-10 sm:px-8 lg:px-12">
      <button
        type="button"
        onClick={() => navigate(back)}
        className="w-fit text-sm text-ink-muted hover:text-rust focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-rust"
      >
        {backLabel}
      </button>

      <h1 className="mt-8 text-3xl leading-tight text-ink sm:text-4xl">{title}</h1>
      {subtitle && <p className="mt-3 max-w-xl text-ink-muted">{subtitle}</p>}

      <div className="lg:grid lg:grid-cols-[minmax(320px,400px)_1fr] lg:items-start lg:gap-x-16 xl:gap-x-20">
        <div className="mt-8 lg:sticky lg:top-10">{form}</div>
        <div className="mt-14 min-w-0 lg:mt-8">{children}</div>
      </div>

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
