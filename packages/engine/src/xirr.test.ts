import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { xirr, xirrFromMonthlyCashflows, type Cashflow } from './xirr';

describe('xirr — hand-checked closed-form case', () => {
  it('a single outflow followed by an inflow exactly one (non-leap) year later at +10% resolves to 10%', () => {
    const cashflows: Cashflow[] = [
      { date: new Date(2023, 0, 1), amount: -100_000 },
      { date: new Date(2024, 0, 1), amount: 110_000 }, // 2023 is not a leap year: exactly 365 days later
    ];
    expect(xirr(cashflows)).toBeCloseTo(0.1, 6);
  });

  it('is indifferent to the order cashflows are supplied in', () => {
    const forward: Cashflow[] = [
      { date: new Date(2023, 0, 1), amount: -100_000 },
      { date: new Date(2024, 0, 1), amount: 110_000 },
    ];
    const reversed = [...forward].reverse();
    expect(xirr(reversed)).toBeCloseTo(xirr(forward), 10);
  });
});

describe('xirr — boundary cases', () => {
  it('rejects a single cashflow', () => {
    expect(() => xirr([{ date: new Date(2024, 0, 1), amount: 1_000 }])).toThrow(RangeError);
  });

  it('rejects all-positive cashflows — there is no rate that reconciles a pure inflow stream', () => {
    const cashflows: Cashflow[] = [
      { date: new Date(2024, 0, 1), amount: 1_000 },
      { date: new Date(2024, 5, 1), amount: 2_000 },
    ];
    expect(() => xirr(cashflows)).toThrow(RangeError);
  });

  it('rejects all-negative cashflows — same reason, the other direction', () => {
    const cashflows: Cashflow[] = [
      { date: new Date(2024, 0, 1), amount: -1_000 },
      { date: new Date(2024, 5, 1), amount: -2_000 },
    ];
    expect(() => xirr(cashflows)).toThrow(RangeError);
  });
});

describe('xirr — consistency between the two entry points', () => {
  it('xirrFromMonthlyCashflows agrees with xirr() given the identical dated cashflows by hand', () => {
    const amounts = [-100_000, -10_000, -10_000, -10_000, -10_000, -10_000, -10_000, -10_000, -10_000, -10_000, -10_000, -10_000, 250_000];
    const startDate = new Date(2024, 3, 15);

    const manual: Cashflow[] = amounts.map((amount, i) => ({
      date: new Date(startDate.getFullYear(), startDate.getMonth() + i, startDate.getDate()),
      amount,
    }));

    expect(xirrFromMonthlyCashflows(amounts, startDate)).toBeCloseTo(xirr(manual), 10);
  });

  it('is indifferent to which start date is used — only the spacing between cashflows matters', () => {
    const amounts = [-500_000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 600_000];
    const a = xirrFromMonthlyCashflows(amounts, new Date(2020, 0, 1));
    const b = xirrFromMonthlyCashflows(amounts, new Date(2025, 6, 15));
    expect(a).toBeCloseTo(b, 6);
  });
});

describe('xirr — property: the solved rate discounts the cashflows to (near) zero NPV', () => {
  it('for randomised, irregularly-dated cashflow streams with at least one inflow and one outflow', () => {
    const cashflowArb = fc
      .array(
        fc.record({
          dayOffset: fc.integer({ min: 0, max: 3_650 }),
          amount: fc
            .integer({ min: -1_000_000, max: 1_000_000 })
            .filter((n) => Math.abs(n) >= 100),
        }),
        { minLength: 2, maxLength: 10 },
      )
      .filter((cfs) => cfs.some((cf) => cf.amount > 0) && cfs.some((cf) => cf.amount < 0));

    fc.assert(
      fc.property(cashflowArb, (raw) => {
        const start = new Date(2015, 0, 1);
        const cashflows: Cashflow[] = raw.map((cf) => ({
          date: new Date(start.getTime() + cf.dayOffset * 24 * 60 * 60 * 1000),
          amount: cf.amount,
        }));

        let rate: number;
        try {
          rate = xirr(cashflows);
        } catch {
          // A small minority of randomised streams (e.g. every cashflow on the same
          // day) have no finite solution or fail to bracket a root — not a defect.
          return;
        }

        const first = [...cashflows].sort((a, b) => a.date.getTime() - b.date.getTime())[0]!.date;
        const residual = cashflows.reduce(
          (sum, cf) => sum + cf.amount / Math.pow(1 + rate, (cf.date.getTime() - first.getTime()) / (365 * 24 * 60 * 60 * 1000)),
          0,
        );
        const scale = Math.max(1, ...cashflows.map((cf) => Math.abs(cf.amount)));
        expect(Math.abs(residual)).toBeLessThan(scale * 1e-3);
      }),
      { numRuns: 300 },
    );
  });
});
