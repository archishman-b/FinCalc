import { CapitalGainsRules } from './capital-gains';
import { CostInflationIndexRules } from './cost-inflation-index';
import { FixedIncomeRules } from './fixed-income';
import { IncomeTaxRules } from './income-tax';
import { ReitDistributionRules } from './reit-distributions';
import { ReitDistributionHistoryPack, ReitDistributionRecord, ReitInstrument, ReitInstrumentsPack } from './reit-reference';
import { RulePackEnvelope } from './schema';
import { StampDutyRules } from './stamp-duty';

export * from './schema';
export * from './income-tax';
export * from './capital-gains';
export * from './cost-inflation-index';
export * from './fixed-income';
export * from './stamp-duty';
export * from './reit-distributions';
export * from './reit-reference';

/**
 * Registry of shipped rule packs. Empty in Phase 0 by design; income-tax and
 * capital-gains packs for FY 2026-27 and FY 2025-26 were added in Phase 2.
 */
import incomeTaxFy2026_27 from '../packs/income-tax.fy-2026-27.json';
import incomeTaxFy2025_26 from '../packs/income-tax.fy-2025-26.json';
import capitalGainsFy2026_27 from '../packs/capital-gains.fy-2026-27.json';
import capitalGainsFy2025_26 from '../packs/capital-gains.fy-2025-26.json';
import costInflationIndex from '../packs/cost-inflation-index.json';
import stampDuty from '../packs/stamp-duty.json';
import fixedIncome from '../packs/fixed-income.json';
import reitDistributionsFy2026_27 from '../packs/reit-distributions.fy-2026-27.json';
import reitDistributionsFy2025_26 from '../packs/reit-distributions.fy-2025-26.json';

const registry: readonly RulePackEnvelope[] = [
  RulePackEnvelope.parse(incomeTaxFy2026_27),
  RulePackEnvelope.parse(incomeTaxFy2025_26),
  RulePackEnvelope.parse(capitalGainsFy2026_27),
  RulePackEnvelope.parse(capitalGainsFy2025_26),
  RulePackEnvelope.parse(costInflationIndex),
  RulePackEnvelope.parse(stampDuty),
  RulePackEnvelope.parse(fixedIncome),
  RulePackEnvelope.parse(reitDistributionsFy2026_27),
  RulePackEnvelope.parse(reitDistributionsFy2025_26),
];

export function listRulePacks(): readonly RulePackEnvelope[] {
  return registry;
}

export function getRulePack(fy: string): RulePackEnvelope | undefined {
  return registry.find((pack) => pack.fy === fy);
}

/** Validates an untrusted object (e.g. a JSON pack) against the envelope; throws a ZodError with the offending path. */
export function parseRulePack(input: unknown): RulePackEnvelope {
  return RulePackEnvelope.parse(input);
}

/** Finds and validates the income-tax pack for an FY, typing `rules` as `IncomeTaxRules`. Throws if the pack is missing or its rules don't match the shape. */
export function getIncomeTaxRules(fy: string): IncomeTaxRules {
  const pack = registry.find((p) => p.fy === fy && p.id.startsWith('income-tax.'));
  if (!pack) throw new RangeError(`getIncomeTaxRules: no income-tax pack registered for FY ${fy}`);
  return IncomeTaxRules.parse(pack.rules);
}

/** Finds and validates the capital-gains pack for an FY, typing `rules` as `CapitalGainsRules`. Throws if the pack is missing or its rules don't match the shape. */
export function getCapitalGainsRules(fy: string): CapitalGainsRules {
  const pack = registry.find((p) => p.fy === fy && p.id.startsWith('capital-gains.'));
  if (!pack) throw new RangeError(`getCapitalGainsRules: no capital-gains pack registered for FY ${fy}`);
  return CapitalGainsRules.parse(pack.rules);
}

/** Validates and returns the single Cost Inflation Index table. Throws if the pack is missing. */
export function getCostInflationIndexRules(): CostInflationIndexRules {
  const pack = registry.find((p) => p.id === 'cost-inflation-index');
  if (!pack) throw new RangeError('getCostInflationIndexRules: cost-inflation-index pack not registered');
  return CostInflationIndexRules.parse(pack.rules);
}

/** Validates and returns the single stamp-duty/GST-on-under-construction pack. Throws if the pack is missing. */
export function getStampDutyRules(): StampDutyRules {
  const pack = registry.find((p) => p.id === 'stamp-duty');
  if (!pack) throw new RangeError('getStampDutyRules: stamp-duty pack not registered');
  return StampDutyRules.parse(pack.rules);
}

/** Finds and validates the reit-distributions pack for an FY, typing `rules` as `ReitDistributionRules`. Throws if the pack is missing or its rules don't match the shape. */
export function getReitDistributionRules(fy: string): ReitDistributionRules {
  const pack = registry.find((p) => p.fy === fy && p.id.startsWith('reit-distributions.'));
  if (!pack) throw new RangeError(`getReitDistributionRules: no reit-distributions pack registered for FY ${fy}`);
  return ReitDistributionRules.parse(pack.rules);
}

/** Validates and returns the single fixed-income (small-savings/EPF/VPF) rate pack. Throws if the pack is missing. */
export function getFixedIncomeRules(): FixedIncomeRules {
  const pack = registry.find((p) => p.id === 'fixed-income');
  if (!pack) throw new RangeError('getFixedIncomeRules: fixed-income pack not registered');
  return FixedIncomeRules.parse(pack.rules);
}

/**
 * The REIT reference packs (reit-reference.ts) are deliberately outside the
 * FY-scoped `registry` above — see that file's doc comment for why (no
 * `https://` source exists yet to satisfy RulePackEnvelope's Provenance).
 * Parsed and exposed the same way regardless: validate once at module load,
 * throw loudly if the shipped JSON stops matching its schema.
 */
import reitInstrumentsPack from '../packs/reit-instruments.json';
import reitDistributionHistoryPack from '../packs/reit-distribution-history.json';

const parsedReitInstruments = ReitInstrumentsPack.parse(reitInstrumentsPack);
const parsedReitDistributionHistory = ReitDistributionHistoryPack.parse(reitDistributionHistoryPack);

/** The 5 major listed Indian REITs' current reference facts (price, CAGR, yield range, portfolio area, growth, P/E, effective-tax-rate note) — see reit-reference.ts's ReitInstrument for the shape and provenance.note for how current this is. */
export function getReitInstruments(): readonly ReitInstrument[] {
  return parsedReitInstruments.instruments;
}

/** One REIT's reference facts by id. Throws if the id isn't one of REIT_IDS or isn't shipped. */
export function getReitInstrument(id: string): ReitInstrument {
  const instrument = parsedReitInstruments.instruments.find((i) => i.id === id);
  if (!instrument) throw new RangeError(`getReitInstrument: no instrument shipped for id "${id}"`);
  return instrument;
}

/** The full quarterly distribution-history table across all 5 REITs (93 records, 2019-08-14 to 2026-08-28) — see reit-reference.ts's ReitDistributionRecord for the shape and computeHistoricalComponentSplit for deriving a default four-component split from it. */
export function getReitDistributionHistory(): readonly ReitDistributionRecord[] {
  return parsedReitDistributionHistory.records;
}
