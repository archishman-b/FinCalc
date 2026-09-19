import { lazy, Suspense } from 'react';

import { ComingSoon } from './routes/ComingSoon';
import { Home } from './routes/Home';
import { useRoute } from './lib/router';

// Recharts (and its d3 dependencies) is the single biggest slice of the
// bundle and only the Comparator route needs it — code-split it so the
// entry router (door 5's "traffic driver", per brief §4) stays fast on a
// phone even before anyone picks a door.
const Comparator = lazy(() => import('./routes/Comparator').then((m) => ({ default: m.Comparator })));

// The Tier 1 grid and its eight calculators (Phase 6) are a second
// code-split boundary — none of them need recharts, but there's no reason
// to ship eight calculators' worth of JS to someone who only ever opens
// the flagship Comparator, or vice versa.
const Tier1Grid = lazy(() => import('./routes/tier1/Tier1Grid').then((m) => ({ default: m.Tier1Grid })));
const EmiCalculator = lazy(() => import('./routes/tier1/EmiCalculator').then((m) => ({ default: m.EmiCalculator })));
const LoanRefinance = lazy(() => import('./routes/tier1/LoanRefinance').then((m) => ({ default: m.LoanRefinance })));
const RentVsBuy = lazy(() => import('./routes/tier1/RentVsBuy').then((m) => ({ default: m.RentVsBuy })));
const SipCalculator = lazy(() => import('./routes/tier1/SipCalculator').then((m) => ({ default: m.SipCalculator })));
const FixedIncomeCalculator = lazy(() =>
  import('./routes/tier1/FixedIncomeCalculator').then((m) => ({ default: m.FixedIncomeCalculator })),
);
const IncomeTaxCalculator = lazy(() =>
  import('./routes/tier1/IncomeTaxCalculator').then((m) => ({ default: m.IncomeTaxCalculator })),
);
const CapitalGainsCalculator = lazy(() =>
  import('./routes/tier1/CapitalGainsCalculator').then((m) => ({ default: m.CapitalGainsCalculator })),
);
const InflationCalculator = lazy(() =>
  import('./routes/tier1/InflationCalculator').then((m) => ({ default: m.InflationCalculator })),
);
const ReitPortfolioBuilder = lazy(() =>
  import('./routes/tier1/ReitPortfolioBuilder').then((m) => ({ default: m.ReitPortfolioBuilder })),
);

const LOADING = <div className="px-5 py-10 text-ink-muted sm:px-8">Loading…</div>;

/**
 * Phase 5 shipped the shell, the entry router and the flagship Comparator.
 * Phase 6 adds the Tier 1 grid (door 5) and its eight calculators — see
 * routes/tier1/. Doors 1 and 4 (affordability, retirement/FIRE) remain
 * ComingSoon; door 2 (rent vs buy) and door 5's "Rent vs Buy" card both
 * now point at the same real route.
 */
export function App() {
  const route = useRoute();

  return (
    <div className="min-h-dvh bg-paper text-ink">
      {route === 'home' && <Home />}
      {route === 'comparator' && (
        <Suspense fallback={LOADING}>
          <Comparator />
        </Suspense>
      )}
      {route === 'rent-vs-buy' && (
        <Suspense fallback={LOADING}>
          <RentVsBuy />
        </Suspense>
      )}
      {route === 'calculators' && (
        <Suspense fallback={LOADING}>
          <Tier1Grid />
        </Suspense>
      )}
      {route === 'calc-emi' && (
        <Suspense fallback={LOADING}>
          <EmiCalculator />
        </Suspense>
      )}
      {route === 'calc-loan-refinance' && (
        <Suspense fallback={LOADING}>
          <LoanRefinance />
        </Suspense>
      )}
      {route === 'calc-sip' && (
        <Suspense fallback={LOADING}>
          <SipCalculator />
        </Suspense>
      )}
      {route === 'calc-fixed-income' && (
        <Suspense fallback={LOADING}>
          <FixedIncomeCalculator />
        </Suspense>
      )}
      {route === 'calc-income-tax' && (
        <Suspense fallback={LOADING}>
          <IncomeTaxCalculator />
        </Suspense>
      )}
      {route === 'calc-capital-gains' && (
        <Suspense fallback={LOADING}>
          <CapitalGainsCalculator />
        </Suspense>
      )}
      {route === 'calc-inflation' && (
        <Suspense fallback={LOADING}>
          <InflationCalculator />
        </Suspense>
      )}
      {route === 'calc-reit-portfolio' && (
        <Suspense fallback={LOADING}>
          <ReitPortfolioBuilder />
        </Suspense>
      )}
      {(route === 'afford' || route === 'retirement') && <ComingSoon route={route} />}
    </div>
  );
}
