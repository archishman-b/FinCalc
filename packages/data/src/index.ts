import { CapitalGainsRules } from './capital-gains';
import { CostInflationIndexRules } from './cost-inflation-index';
import { IncomeTaxRules } from './income-tax';
import { ReitDistributionRules } from './reit-distributions';
import { RulePackEnvelope } from './schema';
import { StampDutyRules } from './stamp-duty';

export * from './schema';
export * from './income-tax';
export * from './capital-gains';
export * from './cost-inflation-index';
export * from './stamp-duty';
export * from './reit-distributions';

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
import reitDistributionsFy2026_27 from '../packs/reit-distributions.fy-2026-27.json';
import reitDistributionsFy2025_26 from '../packs/reit-distributions.fy-2025-26.json';

const registry: readonly RulePackEnvelope[] = [
  RulePackEnvelope.parse(incomeTaxFy2026_27),
  RulePackEnvelope.parse(incomeTaxFy2025_26),
  RulePackEnvelope.parse(capitalGainsFy2026_27),
  RulePackEnvelope.parse(capitalGainsFy2025_26),
  RulePackEnvelope.parse(costInflationIndex),
  RulePackEnvelope.parse(stampDuty),
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
