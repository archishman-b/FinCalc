import { type ComponentType } from 'react';

import { navigate, type RouteId } from '../lib/router';

/**
 * Phase (home-page redesign, Sept 2026): the brief's original "five doors,
 * asked as questions" entry router (brief §4) is replaced with a flat
 * toolkit grid — the user's own framing was "this is a multi-tool kit,
 * focus on the tools, not the questions." The Allocation Comparator keeps
 * its flagship treatment (brief §3 calls it out as "the flagship"); the
 * other nine Tier 1 modules are direct tiles, each a real link like the
 * old Tier 1 grid's rows, not a second funnel page. Affordability and
 * Retirement/FIRE are still `ComingSoon` stubs (see App.tsx) and carry a
 * "Soon" tag rather than pretending otherwise; the REIT Portfolio Builder
 * (added Sept 2026) is live, on top of the engine's existing `reitPosition`
 * — see lib/reit-portfolio.ts.
 *
 * Income tax and capital gains (routes `calc-income-tax` /
 * `calc-capital-gains`, both fully implemented in routes/tier1/) are
 * deliberately left off this grid for now — the user asked for them held
 * back until a couple of modules currently in progress are ready to ship
 * alongside them. Their route files and router.ts/App.tsx entries are
 * untouched; they're simply not linked from here. Re-add two more `Tool`
 * entries below when that's ready.
 *
 * Icons are small inline SVGs rather than a new icon-library dependency —
 * nine one-off line icons don't justify a package, and it keeps this page
 * consistent with the rest of the app's zero-new-dependency posture.
 */

interface IconProps {
  size?: number;
}

type IconComponent = ComponentType<IconProps>;

function IconComparator({ size = 20 }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="3.5" cy="12" r="1.3" />
      <path d="M4.8 12h3.2" />
      <path d="M8 12c2.2 0 2.2-6.5 4.4-6.5H16" />
      <path d="M8 12h8" />
      <path d="M8 12c2.2 0 2.2 6.5 4.4 6.5H16" />
      <circle cx="17.5" cy="5.5" r="1.3" />
      <circle cx="17.5" cy="12" r="1.3" />
      <circle cx="17.5" cy="18.5" r="1.3" />
    </svg>
  );
}

function IconHouse({ size = 18 }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5.5 10.2V19a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-8.8" />
      <path d="M10 20v-5.5h4V20" />
    </svg>
  );
}

function IconEmi({ size = 18 }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 20V9" />
      <path d="M9.3 20V6" />
      <path d="M14.6 20V12.5" />
      <path d="M20 20V15.5" />
      <path d="M2.5 20h19" />
    </svg>
  );
}

function IconRefinance({ size = 18 }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 8.5h14" />
      <path d="M14.5 4.5 18 8.5l-3.5 4" />
      <path d="M20 15.5H6" />
      <path d="M9.5 11.5 6 15.5l3.5 4" />
    </svg>
  );
}

function IconSip({ size = 18 }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3.5 20v-3.5H8v-3.5h4.5V9.5H17V6h3.5" />
    </svg>
  );
}

function IconBank({ size = 18 }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 10 12 4.5 21 10" />
      <path d="M3.5 10h17v1.8h-17z" />
      <path d="M5.5 12.3V19M9.5 12.3V19M14.5 12.3V19M18.5 12.3V19" />
      <path d="M3 20h18" />
    </svg>
  );
}

function IconInflation({ size = 18 }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 17 8.5 11 12.5 14 21 6" />
      <path d="M3 17 8.5 13.3 12.5 15.3 21 12" strokeDasharray="2.5 2.5" />
    </svg>
  );
}

function IconGauge({ size = 18 }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 16.5a8 8 0 0 1 16 0" />
      <path d="M12 16.5 16 9.5" />
      <circle cx="12" cy="16.5" r="1.1" />
      <path d="M4 16.5h1.6M18.4 16.5H20" />
    </svg>
  );
}

function IconSunset({ size = 18 }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6.5 15.5a5.5 5.5 0 0 1 11 0" />
      <path d="M12 7v2.2M6.8 9l1.5 1.5M17.2 9l-1.5 1.5" />
      <path d="M2.5 15.5h19" />
      <path d="M2.5 19h19" />
    </svg>
  );
}

function IconReitPortfolio({ size = 18 }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="13.5" width="7" height="6.5" rx="0.5" />
      <rect x="11.5" y="9" width="7" height="11" rx="0.5" />
      <path d="M6.5 13.5v-2.3l8-3.7 5 2.1" />
      <circle cx="19.5" cy="9.6" r="1.1" />
    </svg>
  );
}

interface Tool {
  number: string;
  name: string;
  detail: string;
  route: RouteId;
  icon: IconComponent;
  soon?: boolean;
}

const TOOLS: Tool[] = [
  { number: '01', name: 'Rent vs Buy', detail: 'Opportunity cost of the down payment, break-even year', route: 'rent-vs-buy', icon: IconHouse },
  { number: '02', name: 'EMI Calculator', detail: 'Amortisation, part-prepayment, step-up EMI', route: 'calc-emi', icon: IconEmi },
  { number: '03', name: 'Loan Refinance', detail: 'Break-even month, and the longer-tenure trap', route: 'calc-loan-refinance', icon: IconRefinance },
  { number: '04', name: 'SIP & Goal Planning', detail: 'Step-up, lumpsum, nominal vs real', route: 'calc-sip', icon: IconSip },
  { number: '05', name: 'Fixed Income', detail: "FD, RD, PPF, SSY, EPF, VPF, NSC & more", route: 'calc-fixed-income', icon: IconBank },
  { number: '06', name: 'Inflation & Real Return', detail: "What today's rupees will cost tomorrow", route: 'calc-inflation', icon: IconInflation },
  { number: '07', name: 'REIT Portfolio Builder', detail: 'SIP or lumpsum across a weighted REIT bucket, distributions & NAV growth', route: 'calc-reit-portfolio', icon: IconReitPortfolio },
  { number: '08', name: 'Affordability & Stress Test', detail: 'What you can safely carry, and what breaks it', route: 'afford', icon: IconGauge, soon: true },
  { number: '09', name: 'Retirement & FIRE', detail: 'Required corpus, gap analysis, lean/fat FIRE', route: 'retirement', icon: IconSunset, soon: true },
];

export function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-5xl flex-col px-5 py-10 sm:px-8">
      <div className="flex items-baseline justify-between gap-4 border-b border-hairline pb-4">
        <div className="flex items-baseline gap-3">
          <span className="text-lg font-bold uppercase tracking-wide text-ink">FinCalc</span>
          <span className="text-sm text-ink-muted">Ten tools, one engine. Pick one to start.</span>
        </div>
        <span className="shrink-0 font-mono text-[11px] uppercase tracking-wider text-ink-muted">10 tools</span>
      </div>

      <button
        type="button"
        onClick={() => navigate('comparator')}
        className="group mt-6 flex items-center gap-6 border border-rust border-l-[3px] px-6 py-6 text-left hover:bg-rust/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-rust sm:px-7"
      >
        <span className="flex h-[52px] w-[52px] shrink-0 items-center justify-center border border-rust text-rust">
          <IconComparator size={28} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-xl font-semibold text-ink sm:text-2xl">Allocation Comparator</span>
            <span className="border border-rust px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-rust">Flagship</span>
          </span>
          <span className="mt-1 block text-sm text-ink-muted">
            Compare housing, land and REITs on equal monthly outflow — after tax and cost
          </span>
        </span>
        <span aria-hidden="true" className="hidden shrink-0 text-2xl font-semibold text-rust sm:block">
          &rarr;
        </span>
      </button>

      <nav aria-label="Tools" className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {TOOLS.map((tool) => {
          const Icon = tool.icon;
          return (
            <button
              key={tool.route}
              type="button"
              onClick={() => navigate(tool.route)}
              className={`group relative flex min-h-[150px] flex-col gap-2 border px-4 py-4 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-rust ${
                tool.soon ? 'border-dashed border-hairline' : 'border-hairline hover:border-rust'
              }`}
            >
              <span className="absolute right-3 top-3 font-mono text-[11px] text-ink-muted">{tool.number}</span>
              <span className="flex h-9 w-9 items-center justify-center border border-hairline text-ink-muted group-hover:border-rust group-hover:text-rust">
                <Icon size={18} />
              </span>
              <span className="text-[15px] font-semibold text-ink group-hover:text-rust">{tool.name}</span>
              <span className="text-[12.5px] leading-snug text-ink-muted">{tool.detail}</span>
              {tool.soon && (
                <span className="mt-auto w-fit border border-ochre px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-ochre">
                  Soon
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <footer className="mt-14 max-w-md text-sm text-ink-muted">
        <p>Information, not advice — FinCalc is not SEBI- or IRDAI-registered investment advice.</p>
      </footer>
    </main>
  );
}
