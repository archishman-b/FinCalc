import type { ReactNode } from 'react';

import { navigate } from '../lib/router';
import type { GraphiteTheme } from '../lib/graphite-theme';

const SUN = (
  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
    <circle cx="8" cy="8" r="3" fill="none" stroke="currentColor" strokeWidth="1.5" />
    <path
      d="M8 1.5v1.8M8 12.7v1.8M1.5 8h1.8M12.7 8h1.8M3.4 3.4l1.3 1.3M11.3 11.3l1.3 1.3M3.4 12.6l1.3-1.3M11.3 4.7l1.3-1.3"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
  </svg>
);
const MOON = (
  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
    <path
      d="M13.5 9.6A5.8 5.8 0 0 1 6.4 2.5a5.8 5.8 0 1 0 7.1 7.1z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
    />
  </svg>
);

const MODULE_TABS = [
  { id: 'reit', label: 'REIT income', route: 'calc-reit-portfolio' },
  { id: 'sip-swp', label: 'SIP & SWP', route: 'calc-sip-swp' },
] as const;

export type GraphiteModuleId = (typeof MODULE_TABS)[number]['id'];

/**
 * Shared topbar for the Graphite-themed modules (REIT income, SIP & SWP) —
 * ported from both prototypes' `.topbar`/`.bar`/`.ticker` (see
 * lib/graphite-theme.ts's module doc comment for why this is a separate
 * design system from the rest of FinCalc, not a new global nav). Each
 * module renders this once, at the top of its own `.graphite` wrapper, and
 * supplies its own `ticker` content via the `TickerLabel`/`TickerItem`
 * helpers below — REIT prices and yields on the REIT route, holdings and
 * net returns on SIP & SWP. The ticker is a per-module slot, not shared
 * state between the two routes.
 *
 * The prototypes link between modules with `<a href>` to each other's
 * artifact URL, since they were separate static pages; here the two
 * modules are routes in the same SPA, so this links with the router's own
 * `navigate()` instead and highlights the active tab via `aria-current`.
 *
 * The FinCalc wordmark (accent square + "FinCalc") doubles as the way back
 * to the landing page — `navigate('home')` — since the two-module app has
 * no other persistent home/back affordance once you're inside a module.
 */
export function GraphiteModuleHeader({
  active,
  moduleLabel,
  theme,
  onToggleTheme,
  ticker,
}: {
  active: GraphiteModuleId;
  moduleLabel: string;
  theme: GraphiteTheme;
  onToggleTheme: () => void;
  ticker?: ReactNode;
}) {
  return (
    <div className="sticky top-0 z-20" style={{ background: 'var(--head)', borderBottom: '1px solid var(--rule)' }}>
      <div className="flex h-[52px] items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('home')}
            aria-label="FinCalc home"
            className="flex flex-shrink-0 items-center gap-2 rounded-sm"
            style={{ color: 'var(--ink)' }}
          >
            <span className="h-5 w-5 flex-shrink-0 rounded-[5px]" style={{ background: 'var(--accent)' }} aria-hidden="true" />
            <b className="text-[14.5px] font-semibold tracking-tight">FinCalc</b>
          </button>
          <span className="truncate text-[13px]" style={{ color: 'var(--muted)' }}>
            / {moduleLabel}
          </span>
        </div>
        <nav aria-label="Modules" className="hidden gap-[22px] text-[12.5px] sm:flex">
          {MODULE_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => navigate(tab.route)}
              aria-current={active === tab.id ? 'page' : undefined}
              style={{ color: active === tab.id ? 'var(--ink)' : 'var(--muted)', fontWeight: active === tab.id ? 600 : 400 }}
            >
              {tab.label}
            </button>
          ))}
        </nav>
        <button
          type="button"
          onClick={onToggleTheme}
          aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md border"
          style={{ borderColor: 'var(--rule)', color: 'var(--ink2)' }}
        >
          {theme === 'dark' ? SUN : MOON}
        </button>
      </div>
      {ticker && (
        <div
          className="flex h-9 items-center overflow-x-auto whitespace-nowrap"
          style={{ borderTop: '1px solid var(--rule)', background: 'var(--panel)' }}
        >
          {ticker}
        </div>
      )}
    </div>
  );
}

/** The ticker's leading uppercase label — matches the prototypes' `.ticker .lab`. */
export function TickerLabel({ children }: { children: ReactNode }) {
  return (
    <span
      className="flex-shrink-0 pl-4 pr-4 text-[10.5px] font-semibold uppercase tracking-[.1em]"
      style={{ color: 'var(--muted)' }}
    >
      {children}
    </span>
  );
}

/** A single ticker entry (`label · value · highlighted value`) — matches the prototypes' `.ticker .it`, exported so each module's ticker content looks identical without duplicating the markup. */
export function TickerItem({ label, value, highlight }: { label: string; value: string; highlight: string }) {
  return (
    <div className="flex items-baseline gap-[9px] border-l px-4 first:border-l-0" style={{ borderColor: 'var(--rule)' }}>
      <span className="text-[11.5px]" style={{ color: 'var(--muted)' }}>
        {label}
      </span>
      <b className="num text-[12px] font-medium" style={{ color: 'var(--ink)' }}>
        {value}
      </b>
      <i className="num text-[12px] font-medium not-italic" style={{ color: 'var(--acctext)' }}>
        {highlight}
      </i>
    </div>
  );
}
