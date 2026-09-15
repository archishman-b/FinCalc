import { navigate, type RouteId } from '../lib/router';

const TITLES: Partial<Record<RouteId, { question: string; phase: string }>> = {
  afford: { question: 'Can I afford this?', phase: 'affordability and the household stress test — a later phase' },
  retirement: { question: 'When can I stop working?', phase: 'retirement planning and FIRE — a later phase' },
};

/** An honest placeholder for the doors not yet built, rather than a broken link or a silently missing route. The Allocation Comparator (door 3), Rent vs Buy (door 2) and the Tier 1 grid (door 5) are all live — see App.tsx. */
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
        This is {info?.phase ?? 'a later phase'} of the build. The Allocation Comparator, Rent vs Buy, and the Tier 1
        calculator grid are live now.
      </p>
      <button
        type="button"
        onClick={() => navigate('calculators')}
        className="mt-8 w-fit rounded-sm bg-rust px-5 py-2.5 text-paper hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rust"
      >
        Try a calculator →
      </button>
    </main>
  );
}
