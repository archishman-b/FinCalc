import { navigate, type RouteId } from '../../lib/router';

interface CalcEntry {
  number: string;
  name: string;
  detail: string;
  route: RouteId;
}

// Brief §3's eight Tier 1 foundations, in the brief's own table order.
// Door 5 ("Just give me a calculator") is the traffic driver — this page
// is the list it lands on. Rent vs Buy reuses the same route as door 2
// (see RentVsBuy.tsx's own doc comment) rather than a separate flow.
const CALCULATORS: CalcEntry[] = [
  { number: '01', name: 'EMI calculator', detail: 'Amortisation, part-prepayment, step-up EMI, total interest', route: 'calc-emi' },
  { number: '02', name: 'Loan comparison & refinance', detail: 'Break-even month, and the lower-EMI-longer-tenure trap', route: 'calc-loan-refinance' },
  { number: '03', name: 'Rent vs Buy', detail: 'Opportunity cost of the down payment, break-even year', route: 'rent-vs-buy' },
  { number: '04', name: 'SIP, step-up, lumpsum & goal', detail: 'Nominal and inflation-adjusted future value', route: 'calc-sip' },
  { number: '05', name: 'Fixed income', detail: 'FD, RD, PPF, SSY, EPF, VPF, NSC, KVP, SCSS & more', route: 'calc-fixed-income' },
  { number: '06', name: 'Income tax', detail: 'Old vs new regime, both shipped financial years', route: 'calc-income-tax' },
  { number: '07', name: 'Capital gains', detail: 'Equity, REIT, debt fund and property, with Section 54', route: 'calc-capital-gains' },
  { number: '08', name: 'Inflation & real return', detail: "What today's rupees will cost, and what a return is really worth", route: 'calc-inflation' },
];

export function Tier1Grid() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col px-5 py-10 sm:px-8">
      <button
        type="button"
        onClick={() => navigate('home')}
        className="w-fit text-sm text-ink-muted hover:text-rust focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-rust"
      >
        ← FinCalc
      </button>

      <h1 className="mt-8 text-3xl leading-tight text-ink sm:text-4xl">Just give me a calculator</h1>
      <p className="mt-3 max-w-md text-ink-muted">Eight foundations, each a direct link — no entry form to get through first.</p>

      <nav aria-label="Calculators" className="mt-10 flex flex-col">
        {CALCULATORS.map((c) => (
          <button
            key={c.route}
            type="button"
            onClick={() => navigate(c.route)}
            className="group flex w-full items-baseline gap-4 border-t border-hairline py-4 text-left last:border-b focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-rust"
          >
            <span className="shrink-0 font-serif tabular-nums text-lg text-ink-muted">{c.number}</span>
            <span className="flex-1">
              <span className="block text-lg text-ink group-hover:text-rust">{c.name}</span>
              <span className="mt-0.5 block text-sm text-ink-muted">{c.detail}</span>
            </span>
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
