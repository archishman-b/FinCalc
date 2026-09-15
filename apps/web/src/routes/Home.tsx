import { navigate, type RouteId } from '../lib/router';

interface Door {
  number: string;
  question: string;
  detail: string;
  route: RouteId;
  flagship?: boolean;
}

// Brief §4's five doors, in the brief's own order. Door 3 is explicitly
// "the flagship" — it's the one door this phase actually builds out, so
// it's the one visually weighted heavier below, not identical to the rest.
const DOORS: Door[] = [
  { number: '01', question: 'Can I afford this?', detail: 'Affordability and a household stress test', route: 'afford' },
  { number: '02', question: 'Should I rent or buy?', detail: 'Full opportunity-cost comparison, break-even year', route: 'rent-vs-buy' },
  {
    number: '03',
    question: 'Where should this money go?',
    detail: 'Compare housing, land and REITs on equal monthly outflow — after tax and cost',
    route: 'comparator',
    flagship: true,
  },
  { number: '04', question: 'When can I stop working?', detail: 'Retirement planning and FIRE', route: 'retirement' },
  { number: '05', question: 'Just give me a calculator', detail: 'EMI, SIP, tax, fixed income and more', route: 'calculators' },
];

export function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col px-5 py-10 sm:px-8">
      <header className="space-y-1">
        <p className="text-sm text-ink-muted">FinCalc</p>
      </header>

      <h1 className="mt-8 max-w-md text-3xl leading-tight tracking-tight text-ink sm:text-4xl">What are you deciding?</h1>

      <nav aria-label="What are you deciding?" className="mt-10 flex flex-col">
        {DOORS.map((door) => (
          <button
            key={door.route}
            type="button"
            onClick={() => navigate(door.route)}
            className={`group flex w-full items-baseline gap-4 border-t border-hairline py-5 text-left last:border-b focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-rust ${
              door.flagship ? 'py-7' : ''
            }`}
          >
            <span
              className={`shrink-0 font-serif tabular-nums ${door.flagship ? 'text-3xl text-rust' : 'text-xl text-ink-muted'}`}
            >
              {door.number}
            </span>
            <span className="flex-1">
              <span
                className={`block ${door.flagship ? 'text-2xl font-medium text-ink' : 'text-lg text-ink'} group-hover:text-rust`}
              >
                {door.question}
              </span>
              <span className={`mt-1 block text-ink-muted ${door.flagship ? 'text-base' : 'text-sm'}`}>{door.detail}</span>
            </span>
            {door.flagship && (
              <span aria-hidden="true" className="shrink-0 self-center text-2xl text-rust">
                →
              </span>
            )}
          </button>
        ))}
      </nav>

      <footer className="mt-16 max-w-md space-y-1 text-sm text-ink-muted">
        <p>Runs entirely in your browser. No backend, no accounts, nothing you enter leaves this page.</p>
        <p>Information, not advice — FinCalc is not SEBI- or IRDAI-registered investment advice.</p>
      </footer>
    </main>
  );
}
