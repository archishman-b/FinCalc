/**
 * Reference facts about India's 5 major listed REITs — current market stats
 * (price, CAGR, yield range, portfolio area, growth, P/E) and their full
 * quarterly distribution history — backing the REIT Portfolio Builder
 * (routes/tier1/ReitPortfolioBuilder.tsx). Deliberately separate from
 * reit-distributions.ts, which covers how a distribution's components are
 * *taxed* (an FY-scoped rule pack, provenance from an official notification);
 * this file covers what each REIT actually *is and has paid*, supplied
 * directly by the user rather than pulled from an official filing.
 *
 * That distinction is why this doesn't join `schema.ts`'s RulePackEnvelope/
 * `registry` — that envelope's Provenance requires an `https://` source
 * (index.test.ts asserts every shipped rule pack has one), which would be a
 * false claim here: nobody has independently verified these figures against
 * BSE/NSE disclosures or each trust's own investor-relations filings yet.
 * `ReitDataProvenance` says exactly that instead of pretending otherwise —
 * see each pack's own `provenance.note`.
 */

import { z } from 'zod';

import { IsoDate } from './schema';

export const ReitDataProvenance = z.object({
  sourceType: z.enum(['user_supplied', 'exchange_filing', 'company_disclosure', 'other']),
  source: z.string().min(1),
  suppliedOn: IsoDate,
  note: z.string().optional(),
});
export type ReitDataProvenance = z.infer<typeof ReitDataProvenance>;

/** The 5 major listed Indian REITs this pack covers, in the order every UI (weight allocator, charts, legends) should present them. */
export const REIT_IDS = ['embassy', 'mindspace', 'brookfield', 'nexus', 'knowledge-realty'] as const;
export type ReitId = (typeof REIT_IDS)[number];

const ReitIdSchema = z.enum(REIT_IDS);

const EffectiveTaxRateNote = z.object({
  forSlabRatePct: z.number().min(0).max(1),
  minPct: z.number().min(0).max(1),
  maxPct: z.number().min(0).max(1),
  note: z.string(),
});

export const ReitInstrument = z.object({
  id: ReitIdSchema,
  name: z.string().min(1),
  assetClassFocus: z.string().min(1),
  marketPriceInr: z.number().positive(),
  /** Trailing price CAGR over the stated window, as a decimal (0.065 = 6.5%/yr). Null means the user's own table reported it as not applicable — see the matching *Note field. */
  priceCagr1y: z.number().nullable(),
  priceCagr1yNote: z.string().optional(),
  priceCagr3y: z.number().nullable(),
  priceCagr3yNote: z.string().optional(),
  priceCagr5y: z.number().nullable(),
  priceCagr5yNote: z.string().optional(),
  distributionYieldRangeMinPct: z.number().min(0).max(1),
  distributionYieldRangeMaxPct: z.number().min(0).max(1),
  totalPortfolioAreaSqFt: z.number().positive(),
  totalPortfolioAreaNote: z.string().optional(),
  revenueYoyGrowthPct: z.number().nullable(),
  revenueYoyGrowthNote: z.string().optional(),
  ebitdaYoyGrowthPct: z.number().nullable(),
  ebitdaYoyGrowthNote: z.string().optional(),
  peRatioTtm: z.number().positive(),
  effectiveTaxRateOnDistributions: EffectiveTaxRateNote,
});
export type ReitInstrument = z.infer<typeof ReitInstrument>;

export const ReitInstrumentsPack = z.object({
  id: z.literal('reit-instruments'),
  asOf: IsoDate,
  jurisdiction: z.string().default('IN'),
  provenance: ReitDataProvenance,
  instruments: z.array(ReitInstrument).length(5),
});
export type ReitInstrumentsPack = z.infer<typeof ReitInstrumentsPack>;

export const ReitDistributionRecord = z.object({
  date: IsoDate,
  reitId: ReitIdSchema,
  recordPriceInr: z.number().positive(),
  totalDpuInr: z.number().nonnegative(),
  interestInr: z.number().nonnegative(),
  dividendExemptInr: z.number().nonnegative(),
  dividendTaxableInr: z.number().nonnegative(),
  debtRepaymentCapReturnInr: z.number().nonnegative(),
  otherIncomeInr: z.number().nonnegative(),
  grossQtrYieldPct: z.number().nonnegative(),
  annualizedYieldPct: z.number().nonnegative(),
  effectivePostTaxYieldPct: z.number().nonnegative(),
});
export type ReitDistributionRecord = z.infer<typeof ReitDistributionRecord>;

export const ReitDistributionHistoryPack = z.object({
  id: z.literal('reit-distribution-history'),
  asOf: IsoDate,
  jurisdiction: z.string().default('IN'),
  provenance: ReitDataProvenance,
  records: z.array(ReitDistributionRecord).min(1),
});
export type ReitDistributionHistoryPack = z.infer<typeof ReitDistributionHistoryPack>;

/** The engine's ReitComponentSplit shape (interest/dividend/rental/returnOfCapital fractions summing to 1) — re-declared here rather than importing @fincalc/engine, since @fincalc/data must not depend on it (the engine depends on data, not the reverse). */
export interface HistoricalComponentSplit {
  interest: number;
  dividend: number;
  rental: number;
  returnOfCapital: number;
  /** How many quarterly records this split was averaged over. */
  quartersObserved: number;
}

/**
 * Averages a REIT's actual disclosed distributions into the engine's
 * four-component split — computed from the supplied records every time,
 * never hardcoded, so a future data refresh changes the default
 * automatically. `dividend` sums the exempt and taxable dividend columns:
 * the engine resolves *whether* dividend is taxable from the FY's rule
 * pack and the per-instrument SPV-election flag (reit-distributions.ts),
 * not from which bucket a past quarter happened to fall in — that
 * split reflects history, not the forward tax treatment. `trailingQuarters`
 * limits the average to the most recent N records (undefined = all-time).
 * All-time is the more stable default for a REIT with only a handful of
 * quarters on record (Knowledge Realty has 5) — see the Portfolio
 * Builder's own doc comment for why it defaults to all-time, not trailing.
 */
export function computeHistoricalComponentSplit(records: readonly ReitDistributionRecord[], reitId: ReitId, trailingQuarters?: number): HistoricalComponentSplit {
  const forReit = records.filter((r) => r.reitId === reitId).sort((a, b) => a.date.localeCompare(b.date));
  const subset = trailingQuarters ? forReit.slice(-trailingQuarters) : forReit;
  if (subset.length === 0) throw new RangeError(`computeHistoricalComponentSplit: no distribution records for reitId "${reitId}"`);

  let interest = 0;
  let dividend = 0;
  let rental = 0;
  let returnOfCapital = 0;
  for (const r of subset) {
    interest += r.interestInr;
    dividend += r.dividendExemptInr + r.dividendTaxableInr;
    rental += r.otherIncomeInr;
    returnOfCapital += r.debtRepaymentCapReturnInr;
  }
  const total = interest + dividend + rental + returnOfCapital;
  if (total <= 0) throw new RangeError(`computeHistoricalComponentSplit: total distributions for reitId "${reitId}" are non-positive`);

  return {
    interest: interest / total,
    dividend: dividend / total,
    rental: rental / total,
    returnOfCapital: returnOfCapital / total,
    quartersObserved: subset.length,
  };
}

/** The most recent distribution record for a REIT — the natural default for "current trailing yield" when a per-REIT yield assumption needs seeding. */
export function latestReitDistributionRecord(records: readonly ReitDistributionRecord[], reitId: ReitId): ReitDistributionRecord {
  const forReit = records.filter((r) => r.reitId === reitId).sort((a, b) => a.date.localeCompare(b.date));
  const latest = forReit[forReit.length - 1];
  if (!latest) throw new RangeError(`latestReitDistributionRecord: no distribution records for reitId "${reitId}"`);
  return latest;
}
