import { GraphiteModuleHeader, TickerLabel } from '../../components/GraphiteModuleHeader';
import { GRAPHITE_CSS_VARS, useGraphiteTheme } from '../../lib/graphite-theme';
import { navigate } from '../../lib/router';

/**
 * SIP & SWP planner — placeholder route. The module tab and shared
 * Graphite header/theme toggle are real and working (this is "Part A" of
 * the two-part build); the simulator itself — engine, data and UI, ported
 * from sip-swp-planner.html — is "Part B", planned separately and not yet
 * built. This stub exists so `#/calc-sip-swp` is a real, consistently
 * themed destination rather than a dead tab.
 */
export function SipSwpPlanner() {
  const { theme, toggle: toggleTheme } = useGraphiteTheme();

  return (
    <div className="graphite -m-4 min-h-screen" data-theme={theme}>
      <style>{GRAPHITE_CSS_VARS}</style>
      <GraphiteModuleHeader
        active="sip-swp"
        moduleLabel="SIP & SWP planner"
        theme={theme}
        onToggleTheme={toggleTheme}
        ticker={<TickerLabel>Coming soon</TickerLabel>}
      />

      <div className="mx-auto max-w-[1400px] p-4 sm:p-6">
        <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-widest" style={{ color: 'var(--acctext)' }}>
          Building
        </div>
        <p className="mb-5 max-w-[66ch] text-lg leading-snug" style={{ color: 'var(--ink)' }}>
          The SIP &amp; SWP planner — building a corpus, then drawing it down with tax-aware withdrawals, de-risking
          and a sustainable-withdrawal search — is being built next, the same way the REIT income module was: a
          verified engine module first, then this UI.
        </p>
        <div
          className="rounded-lg border p-5"
          style={{ background: 'var(--sheet)', borderColor: 'var(--rule)', boxShadow: '0 1px 2px rgba(17,20,24,.04)' }}
        >
          <p className="text-sm" style={{ color: 'var(--ink2)' }}>
            In the meantime, the{' '}
            <button
              type="button"
              onClick={() => navigate('calc-reit-portfolio')}
              className="font-semibold underline"
              style={{ color: 'var(--acctext)' }}
            >
              REIT income module
            </button>{' '}
            is live, and shares this module&rsquo;s theme and tab switcher.
          </p>
        </div>
      </div>
    </div>
  );
}
