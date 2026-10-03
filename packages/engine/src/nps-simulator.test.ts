import { describe, expect, it } from 'vitest';

import { simulateNps, type NpsExitSlabInput, type NpsGlidePointInput, type NpsSimulatorInput } from './nps-simulator';

/**
 * No prototype HTML exists for this module (new build, not a port), so
 * these are hand-derived, independently checkable scenarios: zero-return
 * cases isolate the contribution and exit-slab bookkeeping from the
 * compounding math, and a single clean-percentage compounding case checks
 * the monthly growth-factor math separately.
 */

// The real exit-slab shape from the `nps-rules` data pack as it stood at
// build time (non-government sector) — reproduced here as plain literals so
// this test doesn't couple to the data package, per this engine's own
// no-external-pack-at-runtime convention.
const NON_GOVERNMENT_SLABS: NpsExitSlabInput[] = [
  { upToInr: 800_000, maxLumpSumPct: 100, maxLumpSumFixedInr: null, minAnnuityPct: 0 },
  { upToInr: 1_200_000, maxLumpSumPct: null, maxLumpSumFixedInr: 600_000, minAnnuityPct: 0 },
  { upToInr: null, maxLumpSumPct: 80, maxLumpSumFixedInr: null, minAnnuityPct: 20 },
];

const LC50_GLIDE: NpsGlidePointInput[] = [
  { age: 35, equityPct: 50 },
  { age: 40, equityPct: 40 },
  { age: 45, equityPct: 30 },
  { age: 50, equityPct: 20 },
  { age: 55, equityPct: 10 },
];

function baseInput(overrides: Partial<NpsSimulatorInput> = {}): NpsSimulatorInput {
  return {
    currentAge: 30,
    retirementAge: 31,
    employeeMonthlyContributionInr: 5_000,
    contributionStepUpPctPerYear: 0,
    monthlySalaryInr: 50_000,
    salaryGrowthPctPerYear: 0,
    employerContributionPctOfSalary: 10,
    allocationMode: 'active',
    activeAllocation: { equityPct: 60, corporateDebtPct: 30, governmentSecuritiesPct: 10, alternativePct: 0 },
    lifecycleFund: 'LC50',
    lifecycleGlideTable: LC50_GLIDE,
    sector: 'non_government',
    returnAssumptions: { equityPct: 0, corporateDebtPct: 0, governmentSecuritiesPct: 0, alternativePct: 0 },
    openingCorpusInr: 0,
    annuityRatePct: 6,
    lumpSumWithdrawalPct: 60,
    exitSlabs: NON_GOVERNMENT_SLABS,
    lumpSumTaxExemptFractionOfCorpus: 0.6,
    inflationPct: 0,
    ...overrides,
  };
}

describe('simulateNps — accumulation with zero returns (isolates contribution bookkeeping)', () => {
  const result = simulateNps(baseInput());

  it('accumulates employee + employer contributions with no growth', () => {
    // employee: 5,000/month flat -> 60,000/year; employer: 50,000 * 10% = 5,000/month flat -> 60,000/year
    expect(result.totalEmployeeContributedInr).toBeCloseTo(60_000, 6);
    expect(result.totalEmployerContributedInr).toBeCloseTo(60_000, 6);
    expect(result.corpusAtExitInr).toBeCloseTo(120_000, 6);
  });

  it('reports the fixed Active Choice equity share on the yearly row', () => {
    expect(result.yearly).toHaveLength(1);
    expect(result.yearly[0]!.equitySharePct).toBe(60);
    expect(result.yearly[0]!.corpusAtYearEndInr).toBeCloseTo(120_000, 6);
  });
});

describe('simulateNps — Active Choice blended return (weighted average of non-equity assumptions)', () => {
  it('compounds monthly at the equity-weighted blended annual rate', () => {
    // 100% equity at 12%/year, no contributions: opening 100,000 -> 100,000 * 1.12 after 1 year,
    // since the monthly factor is (1.12)^(1/12) compounded 12 times.
    const result = simulateNps(
      baseInput({
        employeeMonthlyContributionInr: 0,
        employerContributionPctOfSalary: 0,
        activeAllocation: { equityPct: 100, corporateDebtPct: 0, governmentSecuritiesPct: 0, alternativePct: 0 },
        returnAssumptions: { equityPct: 12, corporateDebtPct: 0, governmentSecuritiesPct: 0, alternativePct: 0 },
        openingCorpusInr: 100_000,
      }),
    );
    expect(result.corpusAtExitInr).toBeCloseTo(112_000, 2);
  });

  it('weights the non-equity return by each asset class share, not a flat average', () => {
    // 0% equity, 50% corporate debt @ 8%, 30% gov securities @ 7%, 20% alternatives @ 10%:
    // weighted = (50*8 + 30*7 + 20*10) / 100 = 8.1%/year
    const result = simulateNps(
      baseInput({
        employeeMonthlyContributionInr: 0,
        employerContributionPctOfSalary: 0,
        activeAllocation: { equityPct: 0, corporateDebtPct: 50, governmentSecuritiesPct: 30, alternativePct: 20 },
        returnAssumptions: { equityPct: 20, corporateDebtPct: 8, governmentSecuritiesPct: 7, alternativePct: 10 },
        openingCorpusInr: 100_000,
      }),
    );
    expect(result.corpusAtExitInr).toBeCloseTo(108_100, 2);
  });
});

describe('simulateNps — Auto Choice lifecycle glide', () => {
  it('uses the exact checkpoint equity share when age lands precisely on a checkpoint', () => {
    const result = simulateNps(
      baseInput({
        currentAge: 35,
        retirementAge: 36,
        employeeMonthlyContributionInr: 0,
        employerContributionPctOfSalary: 0,
        allocationMode: 'auto',
        lifecycleFund: 'LC50',
        lifecycleGlideTable: LC50_GLIDE,
        openingCorpusInr: 100_000,
        // equity 25%@20%, blended debt = avg(6,9,12) = 9%; but LC50 at age 35 is 50% equity, not 25 —
        // use distinct values below so the blended figure isn't ambiguous with the Active test above.
        returnAssumptions: { equityPct: 20, corporateDebtPct: 6, governmentSecuritiesPct: 9, alternativePct: 12 },
      }),
    );
    // LC50 checkpoint at age 35 is exactly 50% equity -> blended debt = (6+9+12)/3 = 9%
    // blended = 0.5*20 + 0.5*9 = 10 + 4.5 = 14.5%/year
    expect(result.yearly[0]!.equitySharePct).toBe(50);
    expect(result.corpusAtExitInr).toBeCloseTo(100_000 * 1.145, 2);
  });

  it('linearly interpolates equity share between two checkpoints', () => {
    const result = simulateNps(
      baseInput({
        currentAge: 37,
        retirementAge: 38,
        allocationMode: 'auto',
        lifecycleFund: 'LC50',
        lifecycleGlideTable: LC50_GLIDE,
      }),
    );
    // age 37 is 2/5 of the way from checkpoint 35 (50%) to checkpoint 40 (40%): 50 - 0.4*10 = 46
    expect(result.yearly[0]!.equitySharePct).toBeCloseTo(46, 6);
  });

  it('holds the equity share flat before the first checkpoint and after the last', () => {
    const before = simulateNps(
      baseInput({ currentAge: 25, retirementAge: 26, allocationMode: 'auto', lifecycleGlideTable: LC50_GLIDE }),
    );
    const after = simulateNps(
      baseInput({ currentAge: 60, retirementAge: 61, allocationMode: 'auto', lifecycleGlideTable: LC50_GLIDE }),
    );
    expect(before.yearly[0]!.equitySharePct).toBe(50); // flat at the first checkpoint's value
    expect(after.yearly[0]!.equitySharePct).toBe(10); // flat at the last checkpoint's value
  });
});

describe('simulateNps — exit: lump sum, exemption cap, and annuity', () => {
  it('allows a full 100% lump sum within the lowest slab (corpus <= 8L)', () => {
    const result = simulateNps(
      baseInput({
        employeeMonthlyContributionInr: 0,
        employerContributionPctOfSalary: 0,
        openingCorpusInr: 120_000,
        lumpSumWithdrawalPct: 100,
      }),
    );
    expect(result.corpusAtExitInr).toBeCloseTo(120_000, 6);
    expect(result.exit.maxLumpSumAllowedPct).toBe(100);
    expect(result.exit.lumpSumTakenInr).toBeCloseTo(120_000, 6);
    // exemption capped at 60% of corpus: 72,000 exempt, 48,000 potentially taxable
    expect(result.exit.lumpSumExemptInr).toBeCloseTo(72_000, 6);
    expect(result.exit.lumpSumPotentiallyTaxableInr).toBeCloseTo(48_000, 6);
    expect(result.exit.annuityPurchaseInr).toBeCloseTo(0, 6);
    expect(result.exit.estimatedMonthlyPensionInr).toBeCloseTo(0, 6);
  });

  it('clamps the requested lump sum to the top slab max (80% above 12L) and splits exempt/taxable correctly', () => {
    const result = simulateNps(
      baseInput({
        employeeMonthlyContributionInr: 0,
        employerContributionPctOfSalary: 0,
        openingCorpusInr: 2_000_000,
        lumpSumWithdrawalPct: 100, // requests more than the slab allows
        annuityRatePct: 6,
      }),
    );
    expect(result.exit.maxLumpSumAllowedPct).toBe(80);
    // 2,000,000 * 80% = 1,600,000 lump sum taken (clamped from the requested 100%)
    expect(result.exit.lumpSumTakenInr).toBeCloseTo(1_600_000, 6);
    // exemption capped at 60% of corpus = 1,200,000; remainder 400,000 potentially taxable
    expect(result.exit.lumpSumExemptInr).toBeCloseTo(1_200_000, 6);
    expect(result.exit.lumpSumPotentiallyTaxableInr).toBeCloseTo(400_000, 6);
    // annuity purchase = 2,000,000 - 1,600,000 = 400,000; pension = 400,000 * 6% / 12 = 2,000/month
    expect(result.exit.annuityPurchaseInr).toBeCloseTo(400_000, 6);
    expect(result.exit.estimatedMonthlyPensionInr).toBeCloseTo(2_000, 6);
  });

  it('converts the middle slab’s fixed-rupee lump-sum cap into an effective percentage of the corpus', () => {
    // Corpus of 1,000,000 falls in the 8L-12L slab, capped at a fixed 600,000 lump sum => 60% of this corpus.
    const result = simulateNps(
      baseInput({
        employeeMonthlyContributionInr: 0,
        employerContributionPctOfSalary: 0,
        openingCorpusInr: 1_000_000,
        lumpSumWithdrawalPct: 100,
      }),
    );
    expect(result.exit.maxLumpSumAllowedPct).toBeCloseTo(60, 6);
    expect(result.exit.lumpSumTakenInr).toBeCloseTo(600_000, 6);
  });

  it('never takes more lump sum than requested, even when the slab would allow more', () => {
    const result = simulateNps(
      baseInput({
        employeeMonthlyContributionInr: 0,
        employerContributionPctOfSalary: 0,
        openingCorpusInr: 120_000,
        lumpSumWithdrawalPct: 25,
      }),
    );
    expect(result.exit.lumpSumTakenInr).toBeCloseTo(30_000, 6); // 25% of 120,000, not the slab's 100% max
  });
});

describe('simulateNps — nominal vs. real (Phase 16)', () => {
  it('matches nominal exactly when inflation is zero', () => {
    const result = simulateNps(baseInput({ inflationPct: 0 }));
    expect(result.corpusAtExitRealInr).toBeCloseTo(result.corpusAtExitInr, 6);
    expect(result.exit.lumpSumTakenRealInr).toBeCloseTo(result.exit.lumpSumTakenInr, 6);
  });

  it('deflates a one-year horizon by exactly the annual inflation rate', () => {
    const result = simulateNps(baseInput({ inflationPct: 10 }));
    expect(result.inflationDeflatorAtHorizon).toBeCloseTo(1.1, 10);
    expect(result.corpusAtExitRealInr).toBeCloseTo(result.corpusAtExitInr / 1.1, 6);
    expect(result.yearly[0]!.contributedToDateRealInr).toBeCloseTo(result.yearly[0]!.contributedToDateInr / 1.1, 6);
  });

  it('deflates the exit breakdown (lump sum, exempt, taxable, annuity, pension) consistently by the horizon deflator', () => {
    const result = simulateNps(
      baseInput({
        currentAge: 30,
        retirementAge: 31,
        openingCorpusInr: 2_000_000,
        lumpSumWithdrawalPct: 100,
        inflationPct: 5,
      }),
    );
    const d = result.inflationDeflatorAtHorizon;
    expect(result.exit.lumpSumExemptRealInr).toBeCloseTo(result.exit.lumpSumExemptInr / d, 6);
    expect(result.exit.lumpSumPotentiallyTaxableRealInr).toBeCloseTo(result.exit.lumpSumPotentiallyTaxableInr / d, 6);
    expect(result.exit.annuityPurchaseRealInr).toBeCloseTo(result.exit.annuityPurchaseInr / d, 6);
    expect(result.exit.estimatedMonthlyPensionRealInr).toBeCloseTo(result.exit.estimatedMonthlyPensionInr / d, 6);
  });
});

describe('simulateNps — edge cases', () => {
  it('clamps a retirement age at or before the current age to a 1-year horizon', () => {
    const result = simulateNps(baseInput({ currentAge: 50, retirementAge: 50 }));
    expect(result.yearsSimulated).toBe(1);
    expect(result.yearly).toHaveLength(1);
  });
});
