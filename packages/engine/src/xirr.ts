/**
 * XIRR: the annualised rate that discounts an irregular, dated stream of
 * cashflows to zero net present value. This is what the comparator actually
 * reports as "the return this scenario delivered" — unlike a SIP/lumpsum
 * calculator's implicit rate, XIRR handles cashflows on real calendar dates
 * at irregular intervals (a scenario's rent received some months, a
 * prepayment made once, a sale proceeds on exit), which is the shape every
 * real household cashflow actually takes.
 *
 * Solved by Newton-Raphson from a sensible starting guess, falling back to
 * bisection when Newton fails to converge. Some cashflow shapes are
 * genuinely ill-conditioned for XIRR in floating point — e.g. a large
 * cashflow sitting very close in time to another of comparable size, which
 * makes NPV(rate) so insensitive to rate near the true root that no
 * representable rate reconciles it to a reliably small residual. Rather
 * than silently return a rate whose implied NPV is materially off (a
 * dangerous failure mode for a money tool), this always verifies the
 * candidate solution before returning it and throws if no reliable
 * solution was found.
 */

export interface Cashflow {
  date: Date;
  amount: number;
}

const DAYS_PER_YEAR = 365;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** The residual tolerance a candidate rate must clear, relative to the largest cashflow, to be trusted. */
const RESIDUAL_TOLERANCE = 1e-4;

function yearsFrom(first: Date, date: Date): number {
  return (date.getTime() - first.getTime()) / MS_PER_DAY / DAYS_PER_YEAR;
}

function npv(cashflows: Cashflow[], rate: number): number {
  const first = cashflows[0]!.date;
  return cashflows.reduce((sum, cf) => sum + cf.amount / Math.pow(1 + rate, yearsFrom(first, cf.date)), 0);
}

function npvDerivative(cashflows: Cashflow[], rate: number): number {
  const first = cashflows[0]!.date;
  return cashflows.reduce((sum, cf) => {
    const t = yearsFrom(first, cf.date);
    if (t === 0) return sum;
    return sum - (t * cf.amount) / Math.pow(1 + rate, t + 1);
  }, 0);
}

function scaleOf(cashflows: Cashflow[]): number {
  return Math.max(1, ...cashflows.map((cf) => Math.abs(cf.amount)));
}

/**
 * Estimates the worst-case floating-point rounding error accumulated while summing NPV terms at
 * `rate`. When a candidate rate sits close to -1, `(1 + rate) ^ years` can shrink towards zero for
 * cashflows far from the reference date, blowing individual terms up to many orders of magnitude
 * larger than the cashflow amounts themselves before they (mostly) cancel back down. Double-precision
 * arithmetic only carries ~15-17 significant digits, so once the terms being summed are that much
 * larger than the sum they're expected to produce, the residual is numerically meaningless — it can
 * come out as anything from 0 to a large number purely depending on summation order, not because the
 * candidate rate is actually a good root. This bound (sum of absolute term magnitudes, scaled by
 * machine epsilon and the term count) catches that case so it can be rejected rather than trusted.
 */
function npvNoiseFloor(cashflows: Cashflow[], rate: number): number {
  const first = cashflows[0]!.date;
  const sumOfAbsTerms = cashflows.reduce(
    (sum, cf) => sum + Math.abs(cf.amount / Math.pow(1 + rate, yearsFrom(first, cf.date))),
    0,
  );
  return sumOfAbsTerms * Number.EPSILON * cashflows.length;
}

function assertSolvable(cashflows: Cashflow[]): void {
  if (cashflows.length < 2) {
    throw new RangeError('xirr: need at least two cashflows');
  }
  const hasPositive = cashflows.some((cf) => cf.amount > 0);
  const hasNegative = cashflows.some((cf) => cf.amount < 0);
  if (!hasPositive || !hasNegative) {
    throw new RangeError('xirr: cashflows must include at least one positive and one negative amount');
  }
}

/** Bisection fallback: expands a bracket around a sign change in NPV(rate), then halves it until NPV is within tolerance. Always converges given cashflows that bracket a real, reachable root. */
function xirrByBisection(cashflows: Cashflow[]): number {
  let lo = -0.9999;
  let hi = 10;
  let loValue = npv(cashflows, lo);
  let hiValue = npv(cashflows, hi);

  let expansions = 0;
  while (Math.sign(loValue) === Math.sign(hiValue) && expansions < 60) {
    hi *= 2;
    hiValue = npv(cashflows, hi);
    expansions++;
  }
  if (Math.sign(loValue) === Math.sign(hiValue)) {
    throw new RangeError('xirr: could not bracket a root for these cashflows');
  }

  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const midValue = npv(cashflows, mid);
    if (Math.abs(midValue) < 1e-9) return mid;
    if (Math.sign(midValue) === Math.sign(loValue)) {
      lo = mid;
      loValue = midValue;
    } else {
      hi = mid;
    }
  }
  return (lo + hi) / 2;
}

/**
 * Solves for XIRR given a set of dated cashflows (order doesn't matter — the
 * cashflows are sorted internally). Throws if there are fewer than two
 * cashflows, if they are all the same sign (no rate can reconcile an
 * all-outflow or all-inflow stream), or if no candidate rate — from Newton
 * or from the bisection fallback — reconciles the cashflows to a reliably
 * small residual (see the module doc for why this can genuinely happen).
 */
export function xirr(cashflows: Cashflow[], guess = 0.1): number {
  assertSolvable(cashflows);
  const sorted = [...cashflows].sort((a, b) => a.date.getTime() - b.date.getTime());
  const scale = scaleOf(sorted);

  let rate = guess;
  for (let i = 0; i < 50; i++) {
    const value = npv(sorted, rate);
    const derivative = npvDerivative(sorted, rate);
    if (Math.abs(derivative) < 1e-12) break;
    const next = rate - value / derivative;
    if (!Number.isFinite(next) || next <= -1) break;
    if (Math.abs(next - rate) < 1e-9) {
      rate = next;
      break;
    }
    rate = next;
  }

  const newtonConverged = Number.isFinite(rate) && Math.abs(npv(sorted, rate)) < scale * 1e-6;
  const solved = newtonConverged ? rate : xirrByBisection(sorted);

  // A residual within tolerance only means something if the arithmetic that produced it is
  // trustworthy. When the candidate rate is close enough to -1 that summing the NPV terms involves
  // severe cancellation (see npvNoiseFloor), the residual can look small by coincidence of summation
  // order while the true, order-independent NPV is not actually near zero — so a candidate is only
  // accepted when both the residual and the estimated floating-point noise floor clear the tolerance.
  const tolerance = scale * RESIDUAL_TOLERANCE;
  const residual = Math.abs(npv(sorted, solved));
  const noiseFloor = npvNoiseFloor(sorted, solved);
  if (residual > tolerance || noiseFloor > tolerance) {
    throw new RangeError('xirr: could not converge to a reliable solution for these cashflows');
  }

  return solved;
}

/**
 * Convenience entry point for the common case: a cashflow every month,
 * starting at `startDate` (defaults to an arbitrary fixed epoch — XIRR is
 * indifferent to the calendar date chosen, only the spacing between
 * cashflows matters unless a real start date is supplied). `amounts[i]` is
 * the cashflow `i` months after `startDate`.
 */
export function xirrFromMonthlyCashflows(amounts: number[], startDate: Date = new Date(2000, 0, 1)): number {
  const cashflows: Cashflow[] = amounts.map((amount, i) => ({
    date: new Date(startDate.getFullYear(), startDate.getMonth() + i, startDate.getDate()),
    amount,
  }));
  return xirr(cashflows);
}
