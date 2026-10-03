import { type ComponentType } from 'react';

import { navigate, type RouteId } from '../lib/router';

/**
 * Small landing page for a four-module app — REIT income, SIP & SWP, EPF &
 * VPF and NPS (Tier I) are the whole surface now (see
 * claude/decisions-and-workflow.md for the removal of the flagship
 * Comparator, the Tier 1 grid, and everything else the app used to ship,
 * and for the EPF & VPF / NPS build, Phase 15). Each card just links into
 * its module; the module itself (via GraphiteModuleHeader) is where
 * cross-navigation between modules lives once you're inside one.
 */

interface IconProps {
  size?: number;
}

function IconReitPortfolio({ size = 22 }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="13.5" width="7" height="6.5" rx="0.5" />
      <rect x="11.5" y="9" width="7" height="11" rx="0.5" />
      <path d="M6.5 13.5v-2.3l8-3.7 5 2.1" />
      <circle cx="19.5" cy="9.6" r="1.1" />
    </svg>
  );
}

function IconSipSwp({ size = 22 }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3.5 20v-3.5H8v-3.5h4.5V9.5H17V6h3.5" />
      <path d="M3.5 4v5M3.5 20h17" strokeDasharray="2.2 2.2" />
    </svg>
  );
}

function IconEpfVpf({ size = 22 }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3.5 4 7v5.5c0 5 3.4 8 8 9 4.6-1 8-4 8-9V7z" />
      <path d="M9 12l2.3 2.3L15.5 10" />
    </svg>
  );
}

function IconNps({ size = 22 }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="8.25" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}

interface Module {
  number: string;
  name: string;
  detail: string;
  route: RouteId;
  icon: ComponentType<IconProps>;
}

const MODULES: Module[] = [
  {
    number: '01',
    name: 'REIT income',
    detail: 'SIP or lumpsum across a weighted REIT bucket — distributions, NAV growth, post-tax yield vs. a let-out flat',
    route: 'calc-reit-portfolio',
    icon: IconReitPortfolio,
  },
  {
    number: '02',
    name: 'SIP & SWP',
    detail: 'Build a corpus, then draw it down — withdrawal modes, de-risking glide, bear/base/bull scenarios',
    route: 'calc-sip-swp',
    icon: IconSipSwp,
  },
  {
    number: '03',
    name: 'EPF & VPF',
    detail: 'Project your retirement corpus and EPS pension — the EPS/EPF employer split, VPF top-up, taxable-interest threshold',
    route: 'calc-epf-vpf',
    icon: IconEpfVpf,
  },
  {
    number: '04',
    name: 'NPS (Tier I)',
    detail: 'Auto or Active Choice to exit — corpus growth, lump-sum vs. annuity split, estimated pension',
    route: 'calc-nps',
    icon: IconNps,
  },
];

export function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col px-5 py-10 sm:px-8">
      <div className="flex items-baseline justify-between gap-4 border-b border-hairline pb-4">
        <div className="flex items-baseline gap-3">
          <span className="text-lg font-bold uppercase tracking-wide text-ink">FinCalc</span>
          <span className="text-sm text-ink-muted">Pick a module to start.</span>
        </div>
      </div>

      <nav aria-label="Modules" className="mt-6 flex flex-col gap-4">
        {MODULES.map((mod) => {
          const Icon = mod.icon;
          return (
            <button
              key={mod.route}
              type="button"
              onClick={() => navigate(mod.route)}
              className="group flex items-center gap-5 border border-hairline px-6 py-6 text-left hover:border-rust focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-rust sm:px-7"
            >
              <span className="flex h-[52px] w-[52px] shrink-0 items-center justify-center border border-hairline text-ink-muted group-hover:border-rust group-hover:text-rust">
                <Icon size={24} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-3">
                  <span className="font-mono text-[11px] text-ink-muted">{mod.number}</span>
                  <span className="text-xl font-semibold text-ink group-hover:text-rust sm:text-2xl">{mod.name}</span>
                </span>
                <span className="mt-1 block text-sm text-ink-muted">{mod.detail}</span>
              </span>
              <span aria-hidden="true" className="hidden shrink-0 text-2xl font-semibold text-ink-muted group-hover:text-rust sm:block">
                &rarr;
              </span>
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
