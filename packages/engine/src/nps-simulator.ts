/**
 * National Pension System (NPS, Tier I only — v1 scope) accumulation and
 * exit simulator.
 *
 * Follows this engine's standard shape: a single plain `NpsSimulatorInput`
 * (percentages as plain numbers, e.g. `12` meaning 12%) in, a single
 * `NpsSimulationResult` out. Every figure this module sources from the
 * `@fincalc/data` `nps-rules` pack — the lifecycle glide table, the exit
 * slabs, the lump-sum tax-exempt fraction — is threaded in as plain fields
 * on the input rather than taken as a separate rules-pack parameter, same
 * as every other simulator in this package; the UI layer is what calls
 * `getNpsRules()` and copies the relevant slice in.
 *
 * Two asset-allocation modes are modeled, matching the official NPS
 * Trust calculator's own choices:
 *  - Active Choice: the subscriber fixes Equity (E) / Corporate Debt (C) /
 *    Government Securities (G) / Alternative Assets (A) weights, which stay
 *    constant for the whole simulation. Weights and per-asset-class return
 *    assumptions both come from the caller.
 *  - Auto Choice (lifecycle funds LC75/LC50/LC25): equity share glides down
 *    with age along the fund's published checkpoint table
 *    (`lifecycleGlideTable`), linearly interpolated between checkpoints and
 *    held flat before the first and after the last. The non-equity
 *    remainder is treated as a single blended "debt" return rather than a
 *    separately-sourced Corporate Debt / Government Securities split — a
 *    deliberate simplification, since the lifecycle funds' own C/G sub-split
 *    isn't independently confirmed against a primary source this session.
 *
 * Contributions: the employee contributes a fixed monthly rupee amount that
 * steps up annually by `contributionStepUpPctPerYear`; the employer
 * contributes a percentage of a monthly salary that itself grows annually by
 * `salaryGrowthPctPerYear`. Both land in the same Tier I corpus and share
 * the same allocation.
 *
 * Exit: at the retirement age, the final corpus is matched against the
 * caller-supplied `exitSlabs` table (the applicable sector's slabs from
 * `nps-rules`' `exit.nonGovernmentSlabs` / `governmentSlabs`, per the
 * 16 Dec 2025 PFRDA relaxation) to find the maximum lump-sum percentage
 * allowed, the user's requested lump-sum percentage is clamped to that max,
 * and the lump sum is split into an exempt portion (capped at
 * `lumpSumTaxExemptFractionOfCorpus` of the corpus — the conservative
 * 60%-of-corpus reading of Section 10(12A), which has not been confirmed to
 * have been raised to match PFRDA's new 80% withdrawal ceiling; see the
 * data pack's own citations) and a potentially taxable remainder. The
 * balance of the corpus buys an annuity, and the resulting pension is
 * estimated with a simple yield model (annuity purchase price × assumed
 * annuity rate ÷ 12) — the same "expected annuity rate in, monthly pension
 * out" approach the official NPS Trust calculator itself uses, rather than
 * modeling a specific insurer's annuity product.
 *
 * **Nominal vs. real (Phase 16, revised).** Same convention and same
 * per-simulation-year deflator granularity as `epf-vpf-simulator.ts`'s own
 * "Nominal vs. real" note — see that module's doc comment for the full
 * reasoning, including the post-ship fix it describes: per-year FLOW
 * figures (`employeeContributionThisYearRealInr`,
 * `employerContributionThisYearRealInr`) use that year's own deflator, but
 * `contributedToDateRealInr` and the result-level
 * `total...RealInr`/`corpusAtExitRealInr`/`exit.*RealInr` fields deflate
 * the cumulative NOMINAL total by one single deflator (this row's own, or
 * `horizonDeflator` for the final result) rather than summing per-year-
 * deflated increments — otherwise `totalEmployeeContributedRealInr` +
 * `totalEmployerContributedRealInr` could overstate relative to
 * `corpusAtExitRealInr`, the same paradox found and fixed in the EPF/VPF
 * module.
 *
 * **Post-exit payout timeline (Phase 17).** `exit.estimatedMonthlyPensionInr`
 * above is a flat yield-model estimate with no escalation; `payoutYearly`
 * below simply extends that flat monthly pension (× 12) forward from exit
 * through `planUntilAge` — same simplification (no COLA, no mortality or
 * joint-life/return-of-purchase-price annuity modelling) as
 * `epf-vpf-simulator.ts`'s own payout timeline, which this one mirrors
 * exactly. And for the same reason given there: this payout total has no
 * sibling "stock" figure to reconcile with (the pension is received, not
 * re-invested into a tracked balance), so summing each payout year's OWN
 * deflator — continuing to compound past `horizonDeflator` — is the
 * correct real-terms total here, unlike the cumulative contribution/corpus
 * totals above.
 */

export type NpsAllocationMode = 'active' | 'auto';
export type NpsLifecycleFund = 'LC75' | 'LC50' | 'LC25';
export type NpsSector = 'government' | 'non_government';

/** Fixed E/C/G/A weights for Active Choice. Must sum to 100; not validated here (UI's responsibility). */
export interface NpsActiveAllocationInput {
  equityPct: number;
  corporateDebtPct: number;
  governmentSecuritiesPct: number;
  alternativePct: number;
}

/** Per-asset-class annual return assumptions (percent, e.g. 12 = 12%/year), used by both allocation modes. */
export interface NpsReturnAssumptions {
  equityPct: number;
  corporateDebtPct: number;
  governmentSecuritiesPct: number;
  alternativePct: number;
}

/** One checkpoint of a lifecycle fund's age→equity-share glide table (`@fincalc/data`'s `nps-rules.autoChoice.lifecycles[fund]`). */
export interface NpsGlidePointInput {
  age: number;
  equityPct: number;
}

/** One bracket of an exit-slab table (`@fincalc/data`'s `nps-rules.exit.nonGovernmentSlabs` / `governmentSlabs`). `upToInr: null` marks the unbounded top slab; exactly one of `maxLumpSumPct` / `maxLumpSumFixedInr` is non-null per slab. */
export interface NpsExitSlabInput {
  upToInr: number | null;
  maxLumpSumPct: number | null;
  maxLumpSumFixedInr: number | null;
  minAnnuityPct: number;
}

export interface NpsSimulatorInput {
  currentAge: number;
  retirementAge: number;
  /** Employee's own monthly Tier I contribution (₹), before any step-up. */
  employeeMonthlyContributionInr: number;
  /** Annual step-up applied to the employee's own contribution (percent/year). */
  contributionStepUpPctPerYear: number;
  /** Monthly salary (₹) the employer's percentage contribution is computed against. */
  monthlySalaryInr: number;
  /** Annual salary growth (percent/year), compounding the base the employer contribution is computed against. */
  salaryGrowthPctPerYear: number;
  /** Employer's contribution, as a percentage of monthly salary. */
  employerContributionPctOfSalary: number;
  allocationMode: NpsAllocationMode;
  activeAllocation: NpsActiveAllocationInput;
  lifecycleFund: NpsLifecycleFund;
  /** The chosen lifecycle fund's own glide table. Ignored when `allocationMode` is `'active'`. */
  lifecycleGlideTable: readonly NpsGlidePointInput[];
  sector: NpsSector;
  returnAssumptions: NpsReturnAssumptions;
  openingCorpusInr: number;
  /** Assumed annuity rate (percent/year) used to estimate the post-exit monthly pension. */
  annuityRatePct: number;
  /** Subscriber's requested lump-sum withdrawal at exit, as a percentage of the final corpus (clamped to the applicable slab's max). */
  lumpSumWithdrawalPct: number;
  /** The applicable sector's exit-slab table, ordered by ascending `upToInr` with the last entry's `upToInr` null. */
  exitSlabs: readonly NpsExitSlabInput[];
  /** Fraction of the final corpus the lump sum's tax exemption is capped at. */
  lumpSumTaxExemptFractionOfCorpus: number;
  /** Assumed annual inflation rate (%) used to express every nominal figure in today's money too — see this module's doc comment ("Nominal vs. real"). */
  inflationPct: number;
  /** Age until which the purchased annuity's monthly pension is projected to be received, for the post-exit payout timeline (`payoutYearly` below) — clamped to at least retirementAge; a stand-in for a real life-expectancy assumption. */
  planUntilAge: number;
}

export interface NpsYearRow {
  year: number;
  age: number;
  employeeContributionThisYearInr: number;
  employeeContributionThisYearRealInr: number;
  employerContributionThisYearInr: number;
  employerContributionThisYearRealInr: number;
  /** Equity share (%) in effect during this year (constant for Active Choice, glide-interpolated for Auto Choice). */
  equitySharePct: number;
  corpusAtYearEndInr: number;
  corpusAtYearEndRealInr: number;
  /** Cumulative employee + employer contributions from simulation start through this year — exposed so callers can chart "corpus vs. money put in" without re-deriving a running total themselves. */
  contributedToDateInr: number;
  contributedToDateRealInr: number;
}

export interface NpsExitBreakdown {
  corpusAtExitInr: number;
  corpusAtExitRealInr: number;
  maxLumpSumAllowedPct: number;
  lumpSumTakenInr: number;
  lumpSumTakenRealInr: number;
  lumpSumExemptInr: number;
  lumpSumExemptRealInr: number;
  lumpSumPotentiallyTaxableInr: number;
  lumpSumPotentiallyTaxableRealInr: number;
  annuityPurchaseInr: number;
  annuityPurchaseRealInr: number;
  estimatedMonthlyPensionInr: number;
  estimatedMonthlyPensionRealInr: number;
}

/** One year of the post-exit annuity payout timeline — see this module's doc comment ("Post-exit payout timeline"). */
export interface NpsPensionPayoutYearRow {
  /** Simulation year, continuing the numbering from `NpsYearRow` (so year `yearsSimulated + 1` is the first payout year). */
  year: number;
  age: number;
  pensionReceivedThisYearInr: number;
  pensionReceivedThisYearRealInr: number;
  cumulativePensionReceivedInr: number;
  cumulativePensionReceivedRealInr: number;
}

export interface NpsSimulationResult {
  yearly: readonly NpsYearRow[];
  yearsSimulated: number;
  corpusAtExitInr: number;
  corpusAtExitRealInr: number;
  totalEmployeeContributedInr: number;
  totalEmployeeContributedRealInr: number;
  totalEmployerContributedInr: number;
  totalEmployerContributedRealInr: number;
  /** (1 + inflationPct/100)^yearsSimulated — divide any nominal horizon-end figure by this to get today's rupees. */
  inflationDeflatorAtHorizon: number;
  exit: NpsExitBreakdown;
  /** Year-by-year annuity pension payout from exit through `planUntilAge` — see this module's doc comment ("Post-exit payout timeline"). Empty when `planUntilAge <= retirementAge`. */
  payoutYearly: readonly NpsPensionPayoutYearRow[];
  payoutYearsSimulated: number;
  totalPensionReceivedInr: number;
  totalPensionReceivedRealInr: number;
}

function clampInt(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

/**
 * Linearly interpolates the lifecycle fund's equity share at `age` from its
 * checkpoint table. Held flat before the first checkpoint and after the
 * last, matching how the lifecycle funds behave in practice (no glide
 * before the schedule starts or after it ends).
 */
function lifecycleEquityPctAtAge(checkpoints: readonly NpsGlidePointInput[], age: number): number {
  const sorted = [...checkpoints].sort((a, b) => a.age - b.age);
  const first = sorted[0];
  if (!first) return 0;
  if (age <= first.age) return first.equityPct;
  const last = sorted[sorted.length - 1];
  if (!last) return first.equityPct;
  if (age >= last.age) return last.equityPct;
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const lo = sorted[i];
    const hi = sorted[i + 1];
    if (!lo || !hi) continue;
    if (age >= lo.age && age <= hi.age) {
      const span = hi.age - lo.age;
      if (span <= 0) return lo.equityPct;
      const frac = (age - lo.age) / span;
      return lo.equityPct + frac * (hi.equityPct - lo.equityPct);
    }
  }
  return last.equityPct;
}

function blendedMonthlyGrowthFactor(
  equityPct: number,
  nonEquityPct: number,
  returns: { equityPct: number; nonEquityPct: number },
): number {
  const annualBlended = (equityPct / 100) * returns.equityPct + (nonEquityPct / 100) * returns.nonEquityPct;
  return Math.pow(1 + annualBlended / 100, 1 / 12);
}

export function simulateNps(input: NpsSimulatorInput): NpsSimulationResult {
  const years = clampInt(input.retirementAge - input.currentAge, 1, 60);
  const months = years * 12;

  // For Active Choice, the four weights are fixed; for Auto Choice, equity
  // glides by age and the C/G/A remainder is collapsed into one blended
  // "debt" weight/return so we don't need a separately-sourced C/G split
  // for the lifecycle funds.
  const activeNonEquityWeight =
    input.activeAllocation.corporateDebtPct + input.activeAllocation.governmentSecuritiesPct + input.activeAllocation.alternativePct;
  const activeNonEquityReturn =
    activeNonEquityWeight > 0
      ? (input.activeAllocation.corporateDebtPct * input.returnAssumptions.corporateDebtPct +
          input.activeAllocation.governmentSecuritiesPct * input.returnAssumptions.governmentSecuritiesPct +
          input.activeAllocation.alternativePct * input.returnAssumptions.alternativePct) /
        activeNonEquityWeight
      : input.returnAssumptions.corporateDebtPct;

  const autoBlendedDebtReturn =
    (input.returnAssumptions.corporateDebtPct + input.returnAssumptions.governmentSecuritiesPct + input.returnAssumptions.alternativePct) / 3;

  const inflationRate = input.inflationPct / 100;

  const yearly: NpsYearRow[] = [];
  let corpus = input.openingCorpusInr;
  let totalEmployeeContributed = 0;
  let totalEmployerContributed = 0;
  let employeeContributionThisYear = 0;
  let employerContributionThisYear = 0;

  for (let m = 0; m < months; m += 1) {
    const yearIndex = Math.floor(m / 12);
    const ageThisMonth = input.currentAge + yearIndex;

    const employeeMonthlyContribution =
      input.employeeMonthlyContributionInr * Math.pow(1 + input.contributionStepUpPctPerYear / 100, yearIndex);
    const salaryThisMonth = input.monthlySalaryInr * Math.pow(1 + input.salaryGrowthPctPerYear / 100, yearIndex);
    const employerMonthlyContribution = salaryThisMonth * (input.employerContributionPctOfSalary / 100);

    let equityPct: number;
    let nonEquityReturnPct: number;
    if (input.allocationMode === 'active') {
      equityPct = input.activeAllocation.equityPct;
      nonEquityReturnPct = activeNonEquityReturn;
    } else {
      equityPct = lifecycleEquityPctAtAge(input.lifecycleGlideTable, ageThisMonth);
      nonEquityReturnPct = autoBlendedDebtReturn;
    }
    const nonEquityPct = 100 - equityPct;

    const monthlyGrowthFactor = blendedMonthlyGrowthFactor(equityPct, nonEquityPct, {
      equityPct: input.returnAssumptions.equityPct,
      nonEquityPct: nonEquityReturnPct,
    });

    corpus = corpus * monthlyGrowthFactor + employeeMonthlyContribution + employerMonthlyContribution;

    employeeContributionThisYear += employeeMonthlyContribution;
    employerContributionThisYear += employerMonthlyContribution;
    totalEmployeeContributed += employeeMonthlyContribution;
    totalEmployerContributed += employerMonthlyContribution;

    const isYearBoundary = (m + 1) % 12 === 0;
    if (isYearBoundary) {
      // Deflator resolved once per completed simulation year — see this
      // module's doc comment ("Nominal vs. real"). Per-year FLOW figures
      // use this year's own deflator; contributedToDateRealInr deflates
      // the cumulative NOMINAL total by this same row's single deflator
      // instead of summing per-year-deflated increments.
      const yearDeflator = Math.pow(1 + inflationRate, yearIndex + 1);

      yearly.push({
        year: yearIndex + 1,
        age: ageThisMonth + 1,
        employeeContributionThisYearInr: employeeContributionThisYear,
        employeeContributionThisYearRealInr: employeeContributionThisYear / yearDeflator,
        employerContributionThisYearInr: employerContributionThisYear,
        employerContributionThisYearRealInr: employerContributionThisYear / yearDeflator,
        equitySharePct: equityPct,
        corpusAtYearEndInr: corpus,
        corpusAtYearEndRealInr: corpus / yearDeflator,
        contributedToDateInr: totalEmployeeContributed + totalEmployerContributed,
        contributedToDateRealInr: (totalEmployeeContributed + totalEmployerContributed) / yearDeflator,
      });
      employeeContributionThisYear = 0;
      employerContributionThisYear = 0;
    }
  }

  const corpusAtExit = corpus;
  const slabs = input.exitSlabs;
  const fallbackSlab: NpsExitSlabInput = { upToInr: null, maxLumpSumPct: 100, maxLumpSumFixedInr: null, minAnnuityPct: 0 };
  const applicableSlab =
    slabs.find((slab) => slab.upToInr !== null && corpusAtExit <= slab.upToInr) ?? slabs[slabs.length - 1] ?? fallbackSlab;

  let maxLumpSumAllowedPct: number;
  if (applicableSlab.maxLumpSumPct !== null) {
    maxLumpSumAllowedPct = applicableSlab.maxLumpSumPct;
  } else if (applicableSlab.maxLumpSumFixedInr !== null && corpusAtExit > 0) {
    maxLumpSumAllowedPct = Math.min(100, (applicableSlab.maxLumpSumFixedInr / corpusAtExit) * 100);
  } else {
    maxLumpSumAllowedPct = 100;
  }

  const requestedLumpSumPct = clampInt(input.lumpSumWithdrawalPct, 0, 100);
  const effectiveLumpSumPct = Math.min(requestedLumpSumPct, maxLumpSumAllowedPct);
  const lumpSumTaken = corpusAtExit * (effectiveLumpSumPct / 100);
  const lumpSumExemptCap = corpusAtExit * input.lumpSumTaxExemptFractionOfCorpus;
  const lumpSumExempt = Math.min(lumpSumTaken, lumpSumExemptCap);
  const lumpSumPotentiallyTaxable = Math.max(0, lumpSumTaken - lumpSumExempt);
  const annuityPurchase = corpusAtExit - lumpSumTaken;
  const estimatedMonthlyPension = (annuityPurchase * (input.annuityRatePct / 100)) / 12;
  const horizonDeflator = Math.pow(1 + inflationRate, years);

  // Post-exit payout timeline (see doc comment): the flat monthly annuity
  // pension extended year-by-year from exit through planUntilAge. Same
  // per-payout-year-own-deflator treatment as epf-vpf-simulator.ts's own
  // payout timeline, for the same reason (no sibling stock to reconcile
  // with).
  const payoutYears = clampInt(input.planUntilAge - input.retirementAge, 0, 60);
  const annualPension = estimatedMonthlyPension * 12;
  const payoutYearly: NpsPensionPayoutYearRow[] = [];
  let cumulativePensionReceived = 0;
  let cumulativePensionReceivedReal = 0;
  for (let k = 1; k <= payoutYears; k++) {
    const payoutYearDeflator = horizonDeflator * Math.pow(1 + inflationRate, k);
    cumulativePensionReceived += annualPension;
    cumulativePensionReceivedReal += annualPension / payoutYearDeflator;
    payoutYearly.push({
      year: years + k,
      age: input.retirementAge + k,
      pensionReceivedThisYearInr: annualPension,
      pensionReceivedThisYearRealInr: annualPension / payoutYearDeflator,
      cumulativePensionReceivedInr: cumulativePensionReceived,
      cumulativePensionReceivedRealInr: cumulativePensionReceivedReal,
    });
  }

  return {
    yearly,
    yearsSimulated: years,
    corpusAtExitInr: corpusAtExit,
    corpusAtExitRealInr: corpusAtExit / horizonDeflator,
    totalEmployeeContributedInr: totalEmployeeContributed,
    totalEmployeeContributedRealInr: totalEmployeeContributed / horizonDeflator,
    totalEmployerContributedInr: totalEmployerContributed,
    totalEmployerContributedRealInr: totalEmployerContributed / horizonDeflator,
    inflationDeflatorAtHorizon: horizonDeflator,
    exit: {
      corpusAtExitInr: corpusAtExit,
      corpusAtExitRealInr: corpusAtExit / horizonDeflator,
      maxLumpSumAllowedPct,
      lumpSumTakenInr: lumpSumTaken,
      lumpSumTakenRealInr: lumpSumTaken / horizonDeflator,
      lumpSumExemptInr: lumpSumExempt,
      lumpSumExemptRealInr: lumpSumExempt / horizonDeflator,
      lumpSumPotentiallyTaxableInr: lumpSumPotentiallyTaxable,
      lumpSumPotentiallyTaxableRealInr: lumpSumPotentiallyTaxable / horizonDeflator,
      annuityPurchaseInr: annuityPurchase,
      annuityPurchaseRealInr: annuityPurchase / horizonDeflator,
      estimatedMonthlyPensionInr: estimatedMonthlyPension,
      estimatedMonthlyPensionRealInr: estimatedMonthlyPension / horizonDeflator,
    },
    payoutYearly,
    payoutYearsSimulated: payoutYears,
    totalPensionReceivedInr: cumulativePensionReceived,
    totalPensionReceivedRealInr: cumulativePensionReceivedReal,
  };
}
