/**
 * The EPF & VPF module's accumulation-to-retirement simulator — modelled on
 * the official EPFO Member Pension Calculator's input/output shape
 * (epfindia.gov.in/EP_Cal/pension.html: a handful of inputs, a dense block
 * of derived figures) rather than ported from any existing engine module,
 * since no prior phase built an EPF-specific simulator (the Phase 6 Fixed
 * Income calculator this engine once fed, now deleted per Phase 11, only
 * ever modelled EPF/VPF as one line among fourteen small-savings products
 * via `fixed-income.ts`'s generic compounding primitives — it never split
 * the employer's contribution into EPS/EPF, which is this module's whole
 * point).
 *
 * Two mechanics this simulator adds that no other engine module has:
 *
 * 1. **The EPS/EPF employer-contribution split.** By law the employer's 12%
 *    contribution isn't one pool — 8.33% of it (capped at the wage ceiling)
 *    is diverted to the Employees' Pension Scheme, a defined-benefit scheme
 *    that does NOT compound into this account's corpus; only the remainder
 *    joins the EPF balance this simulator actually projects. EPS
 *    contributions are tracked (`employerEpsContributionThisYearInr`) purely
 *    for visibility and to drive the EPS pension estimate below — they are
 *    never added to `nonTaxableBalance`/`taxableBalance`.
 *
 * 2. **Budget 2021's taxable-interest-above-threshold rule**, tracked with
 *    two parallel running balances rather than one. Each month, the
 *    employee's own contribution (mandatory + VPF) is split between a
 *    "non-taxable" bucket (up to `taxableInterestThresholdPerYearInr` of
 *    employee contribution in that simulation year) and a "taxable" bucket
 *    (the excess) — both earn the same EPF rate, but interest credited to
 *    the taxable bucket is reported separately as taxable "income from
 *    other sources" rather than folded into the EEE corpus. The employer's
 *    EPF-side contribution (and its own interest) always joins the
 *    non-taxable bucket — this rule only ever taxes interest on the
 *    EMPLOYEE's own excess contribution. A simulation "year" here is
 *    treated as a financial year for threshold-reset purposes (the
 *    contribution window starts at month 0, matching how every other
 *    engine module in this codebase treats simulation year 1 as FY 1 of
 *    the plan) — a simplification if the real plan doesn't start in April,
 *    same tier as this project's other calendar-alignment simplifications.
 *
 * Interest crediting: EPFO's real mechanism computes interest monthly on
 * the running balance but credits it to the account only once a year, at
 * FY end. This simulator instead compounds monthly throughout (the EPF
 * rate converted to an equivalent monthly factor) — a documented
 * simplification already anticipated by `fixed-income.ts`'s own module doc
 * comment ("EPF's monthly contribution... compounded monthly since the
 * contribution itself is monthly"), and the standard approximation most
 * EPF calculators use. It will differ slightly from EPFO's own
 * once-a-year-credited figure, immaterial at these rates over realistic
 * horizons.
 *
 * The EPS monthly-pension estimate uses the textbook formula (pensionable
 * salary × pensionable service ÷ pension divisor) with pensionable salary
 * taken as the average of the last 5 years' monthly wage, capped at the
 * EPS pensionable-salary ceiling — the real EPFO formula's "weightage" rule
 * (service beyond 20 years adds a bonus 2 years) is NOT modelled, since it
 * wasn't independently confirmed against a primary source this session
 * (see `claude/pf-nps-research-and-plan.md`) — flagged as an approximate
 * estimate in the UI, not a precise EPFO-grade pension quote.
 */

export interface EpfVpfSimulatorInput {
  currentAge: number;
  retirementAge: number;
  /** Current monthly Basic + DA — the wage base every contribution is computed from. */
  monthlyBasicPlusDaInr: number;
  salaryGrowthPctPerYear: number;
  /** Mandatory employee contribution, % of Basic + DA (statutorily 12, but left editable rather than hardcoded). */
  employeeContributionRatePct: number;
  /** Additional voluntary top-up, % of Basic + DA, on top of the mandatory rate above — 0 means no VPF. */
  vpfContributionRatePct: number;
  /** Employer's total contribution, % of Basic + DA, before the EPS/EPF split (statutorily 12). */
  employerContributionRatePct: number;
  /** The statutory wage ceiling (₹/month) the EPS share is capped against — from `@fincalc/data`'s `epf-rules` pack, user-editable. */
  wageCeilingInr: number;
  /** Share of the employer's contribution diverted to EPS, % — applied only up to wageCeilingInr of wages. */
  epsShareOfEmployerRatePct: number;
  /** EPF/VPF annual interest rate, % — from `@fincalc/data`'s `fixed-income` pack (`products.epf.rate`), user-editable. */
  epfInterestRatePct: number;
  /** Existing EPF+VPF balance already accumulated, if any. Treated as already non-taxable-bucket balance — a simplification for anyone starting mid-career with a pre-existing account. */
  openingBalanceInr: number;
  /** Pensionable service already accrued before this simulation starts, in years. */
  openingPensionableServiceYears: number;
  /** Budget 2021 threshold: interest on the employee's own contribution above this much, in a (simulation) year, is taxable — from `@fincalc/data`'s `epf-rules` pack. */
  taxableInterestThresholdPerYearInr: number;
  epsPensionDivisor: number;
  epsPensionableSalaryCeilingInr: number;
}

export interface EpfVpfYearRow {
  year: number;
  age: number;
  /** Monthly Basic + DA during this simulation year (after salary growth), for reference. */
  monthlyBasicPlusDaInr: number;
  employeeContributionThisYearInr: number;
  employerEpfContributionThisYearInr: number;
  /** Diverted to EPS this year — does not compound into this account's balance, tracked for visibility and the EPS pension estimate only. */
  employerEpsContributionThisYearInr: number;
  interestCreditedThisYearInr: number;
  /** The share of this year's interest attributable to the employee's own excess (above-threshold) contribution — taxable at slab rate as "income from other sources," reported for the user's own return, not auto-deducted here. */
  taxableInterestThisYearInr: number;
  closingBalanceInr: number;
  /** Cumulative employee + employer-EPF contributions from simulation start through this year (excludes EPS, which never compounds into this balance) — exposed so callers can chart "corpus vs. money put in" without re-deriving a running total themselves. */
  contributedToDateInr: number;
}

export interface EpfVpfSimulationResult {
  yearly: readonly EpfVpfYearRow[];
  yearsSimulated: number;
  corpusAtRetirementInr: number;
  totalEmployeeContributedInr: number;
  totalEmployerEpfContributedInr: number;
  totalEmployerEpsContributedInr: number;
  totalInterestEarnedInr: number;
  totalTaxableInterestInr: number;
  pensionableServiceYears: number;
  /** Average of the last up-to-5 years' monthly wage, capped at the EPS pensionable-salary ceiling. */
  epsPensionableSalaryInr: number;
  /** pensionableSalary × pensionableServiceYears ÷ pensionDivisor — an approximate estimate, see this module's doc comment. */
  epsMonthlyPensionEstimateInr: number;
}

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

export function simulateEpfVpf(input: EpfVpfSimulatorInput): EpfVpfSimulationResult {
  const years = clampInt(input.retirementAge - input.currentAge, 1, 60);
  const N = years * 12;
  const monthlyGrowthFactor = Math.pow(1 + Math.max(0, input.epfInterestRatePct) / 100, 1 / 12);
  const salaryGrowthRate = input.salaryGrowthPctPerYear / 100;
  const employeeRate = Math.max(0, input.employeeContributionRatePct + input.vpfContributionRatePct) / 100;
  const employerRate = Math.max(0, input.employerContributionRatePct) / 100;
  const epsRate = Math.max(0, input.epsShareOfEmployerRatePct) / 100;
  const wageCeiling = Math.max(0, input.wageCeilingInr);
  const threshold = Math.max(0, input.taxableInterestThresholdPerYearInr);

  let nonTaxableBalance = Math.max(0, input.openingBalanceInr);
  let taxableBalance = 0;

  let employeeContribSoFarThisYear = 0;
  let yearEmployeeContrib = 0;
  let yearEmployerEpf = 0;
  let yearEmployerEps = 0;
  let yearInterest = 0;
  let yearTaxableInterest = 0;
  let wageThisYear = input.monthlyBasicPlusDaInr;

  let totalEmployeeContributed = 0;
  let totalEmployerEpf = 0;
  let totalEmployerEps = 0;
  let totalInterest = 0;
  let totalTaxableInterest = 0;

  const yearly: EpfVpfYearRow[] = [];

  for (let t = 0; t < N; t++) {
    const yearIndex = Math.floor(t / 12);
    if (t % 12 === 0) {
      wageThisYear = Math.max(0, input.monthlyBasicPlusDaInr) * Math.pow(1 + salaryGrowthRate, yearIndex);
      employeeContribSoFarThisYear = 0;
    }

    const employeeContribThisMonth = wageThisYear * employeeRate;
    const epsBase = Math.min(wageThisYear, wageCeiling);
    const employerEpsThisMonth = epsBase * epsRate;
    const employerEpfThisMonth = Math.max(0, wageThisYear * employerRate - employerEpsThisMonth);

    const roomLeftInThreshold = Math.max(0, threshold - employeeContribSoFarThisYear);
    const nonTaxableShare = Math.min(employeeContribThisMonth, roomLeftInThreshold);
    const taxableShare = employeeContribThisMonth - nonTaxableShare;
    employeeContribSoFarThisYear += employeeContribThisMonth;

    nonTaxableBalance += nonTaxableShare + employerEpfThisMonth;
    taxableBalance += taxableShare;

    const interestNonTaxable = nonTaxableBalance * (monthlyGrowthFactor - 1);
    const interestTaxable = taxableBalance * (monthlyGrowthFactor - 1);
    nonTaxableBalance += interestNonTaxable;
    taxableBalance += interestTaxable;

    yearEmployeeContrib += employeeContribThisMonth;
    yearEmployerEpf += employerEpfThisMonth;
    yearEmployerEps += employerEpsThisMonth;
    yearInterest += interestNonTaxable + interestTaxable;
    yearTaxableInterest += interestTaxable;
    totalEmployeeContributed += employeeContribThisMonth;
    totalEmployerEpf += employerEpfThisMonth;
    totalEmployerEps += employerEpsThisMonth;
    totalInterest += interestNonTaxable + interestTaxable;
    totalTaxableInterest += interestTaxable;

    if ((t + 1) % 12 === 0) {
      yearly.push({
        year: yearIndex + 1,
        age: input.currentAge + yearIndex + 1,
        monthlyBasicPlusDaInr: wageThisYear,
        employeeContributionThisYearInr: yearEmployeeContrib,
        employerEpfContributionThisYearInr: yearEmployerEpf,
        employerEpsContributionThisYearInr: yearEmployerEps,
        interestCreditedThisYearInr: yearInterest,
        taxableInterestThisYearInr: yearTaxableInterest,
        closingBalanceInr: nonTaxableBalance + taxableBalance,
        contributedToDateInr: totalEmployeeContributed + totalEmployerEpf,
      });
      yearEmployeeContrib = 0;
      yearEmployerEpf = 0;
      yearEmployerEps = 0;
      yearInterest = 0;
      yearTaxableInterest = 0;
    }
  }

  const corpusAtRetirement = nonTaxableBalance + taxableBalance;
  const last5 = yearly.slice(-5);
  const avgLast5Wage = last5.length > 0 ? last5.reduce((a, r) => a + r.monthlyBasicPlusDaInr, 0) / last5.length : 0;
  const epsPensionableSalary = Math.min(avgLast5Wage, Math.max(0, input.epsPensionableSalaryCeilingInr));
  const pensionableServiceYears = Math.max(0, input.openingPensionableServiceYears) + years;
  const epsMonthlyPension = input.epsPensionDivisor > 0 ? (epsPensionableSalary * pensionableServiceYears) / input.epsPensionDivisor : 0;

  return {
    yearly,
    yearsSimulated: years,
    corpusAtRetirementInr: corpusAtRetirement,
    totalEmployeeContributedInr: totalEmployeeContributed,
    totalEmployerEpfContributedInr: totalEmployerEpf,
    totalEmployerEpsContributedInr: totalEmployerEps,
    totalInterestEarnedInr: totalInterest,
    totalTaxableInterestInr: totalTaxableInterest,
    pensionableServiceYears,
    epsPensionableSalaryInr: epsPensionableSalary,
    epsMonthlyPensionEstimateInr: epsMonthlyPension,
  };
}
