import type { ReactNode } from 'react';

/**
 * Small Graphite-themed form building blocks — `FieldRow`, `Stepper`,
 * `SliderField`, `Segmented`, `Card` — extracted from `ReitPortfolioBuilder.tsx`
 * (where they were first written, as private, unexported functions) once the
 * SIP & SWP planner needed the identical components rather than a second,
 * drifting copy. Both Graphite routes (REIT income, SIP & SWP) import from
 * here; neither defines its own version any more. Pure presentation, styled
 * entirely through the `.graphite` custom-property tokens (`lib/graphite-theme.ts`)
 * — no logic or state of its own beyond the controlled-input plumbing each
 * component already had.
 */

export function FieldRow({ label, hint, children }: { label: string; hint?: string | undefined; children: ReactNode }) {
  return (
    <div className="mb-2.5 grid grid-cols-[minmax(0,1fr)_104px] items-center gap-2.5">
      <label className="text-xs" style={{ color: 'var(--ink2)' }}>
        {label}
        {hint && <small className="mt-0.5 block text-[10.5px] leading-snug" style={{ color: 'var(--muted)' }}>{hint}</small>}
      </label>
      {children}
    </div>
  );
}

export function Stepper({
  value,
  onChange,
  step = 1,
  min,
  max,
  suffix,
}: {
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  suffix?: string | undefined;
}) {
  const clamp = (v: number) => Math.max(min ?? -Infinity, Math.min(max ?? Infinity, v));
  return (
    <div className="relative">
      <input
        type="number"
        value={Number.isFinite(value) ? value : 0}
        step={step}
        min={min}
        max={max}
        onChange={(e) => onChange(clamp(parseFloat(e.target.value) || 0))}
        className={`num h-8 w-full rounded border text-right text-[12.5px] font-medium ${suffix ? 'pr-9' : 'pr-6'}`}
        style={{ background: 'var(--field)', borderColor: 'var(--rule)', color: 'var(--ink)' }}
      />
      {suffix && (
        <span className="pointer-events-none absolute right-6 top-1/2 -translate-y-1/2 text-[11px]" style={{ color: 'var(--muted)' }}>
          {suffix}
        </span>
      )}
      <span className="absolute right-0 top-0 flex h-full w-5 flex-col border-l" style={{ borderColor: 'var(--rule)' }}>
        <button type="button" tabIndex={-1} onClick={() => onChange(clamp(value + step))} className="flex-1 text-[9px]" style={{ color: 'var(--muted)' }} aria-label="Increase">
          ▲
        </button>
        <button type="button" tabIndex={-1} onClick={() => onChange(clamp(value - step))} className="flex-1 border-t text-[9px]" style={{ borderColor: 'var(--rule)', color: 'var(--muted)' }} aria-label="Decrease">
          ▼
        </button>
      </span>
    </div>
  );
}

export function SliderField({
  label,
  hint,
  value,
  onChange,
  min,
  max,
  step,
  suffix,
}: {
  label: string;
  hint?: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  suffix?: string;
}) {
  return (
    <div className="mb-3">
      <FieldRow label={label} hint={hint}>
        <Stepper value={value} onChange={onChange} step={step} min={min} max={max} suffix={suffix} />
      </FieldRow>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={Number.isFinite(value) ? value : min}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="mt-[-6px] w-full"
      />
      <div className="mt-0.5 flex justify-between text-[10px] num" style={{ color: 'var(--muted)' }}>
        <span>{min}{suffix ?? ''}</span>
        <span>{max}{suffix ?? ''}</span>
      </div>
    </div>
  );
}

export function Segmented<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex gap-0.5 rounded-lg border p-0.5" style={{ background: 'var(--panel)', borderColor: 'var(--rule)' }}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className="rounded px-2.5 py-1 text-xs font-medium"
          style={value === o.value ? { background: 'var(--sheet)', color: 'var(--ink)', boxShadow: '0 1px 2px rgba(17,20,24,.08)' } : { color: 'var(--muted)' }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border p-5 ${className}`} style={{ background: 'var(--sheet)', borderColor: 'var(--rule)', boxShadow: '0 1px 2px rgba(17,20,24,.04)' }}>
      {children}
    </div>
  );
}
