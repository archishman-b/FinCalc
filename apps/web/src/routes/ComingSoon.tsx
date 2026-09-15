import { navigate, type RouteId } from '../lib/router';

const TITLES: Partial<Record<RouteId, { question: string; phase: string }>> = {
  afford: { question: 'Can I afford this?', phase: 'affordability and the household stress test — a later phase' },
  'rent-vs-buy': { question: 'Should I rent or buy?', phase: 'the dedicated rent-vs-buy flow — a later phase' },
  retirement: { question: 'When can I stop working?', phase: 'retirement planning and FIRE — a later phase' },
  calculators: { question: 'Just give me a calculator', phase: 'the Tier 1 calculator grid — Phase 6' },
};

/** An honest placeholder for the four doors Phase 5 doesn't build out, rather than a broken link or a silently missing route. The flagship (door 3, the Allocation Comparator) is the one door this phase actually ships. */
export function ComingSoon({ route }: { route: RouteId }) {
  const info = TITLES[route];
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col px-5 py-10 sm:px-8">
      <button
        type="button"
        onClick={() => navigate('home')}
        className="w-fit text-sm text-ink-muted hover:text-rust focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-rust"
      >
        ← FinCalc
      </button>

      <h1 className="mt-10 text-3xl leading-tight text-ink sm:text-4xl">{info?.question ?? 'Coming soon'}</h1>
      <p className="mt-4 max-w-md text-ink-muted">
        This is {info?.phase ?? 'a later phase'} of the build. The Allocation Comparator — comparing housing, land and REIT
        allocations on equal monthly outflow — is live now.
      </p>
      <button
        type="button"
        onClick={() => navigate('comparator')}
        className="mt-8 w-fit rounded-sm bg-rust px-5 py-2.5 text-paper hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rust"
      >
        Try the Allocation Comparator →
      </button>
    </main>
  );
}
