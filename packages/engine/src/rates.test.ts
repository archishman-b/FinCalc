import { describe, expect, it } from 'vitest';

import { annualizeEffective, annualizeNominal, effectiveMonthlyRate, nominalMonthlyRate } from './rates';

describe('nominalMonthlyRate', () => {
  it('divides the annual rate by 12', () => {
    expect(nominalMonthlyRate(0.12)).toBeCloseTo(0.01, 12);
  });
});

describe('effectiveMonthlyRate', () => {
  it('is the geometric monthly rate that compounds to the stated annual rate', () => {
    const monthly = effectiveMonthlyRate(0.12);
    expect(Math.pow(1 + monthly, 12)).toBeCloseTo(1.12, 10);
  });
});

describe('nominal vs effective', () => {
  it('are not interchangeable for the same annual rate — mixing them is the classic silent-money-bug', () => {
    expect(nominalMonthlyRate(0.12)).not.toBeCloseTo(effectiveMonthlyRate(0.12), 4);
  });
});

describe('annualizeNominal / annualizeEffective', () => {
  it('annualizeNominal inverts nominalMonthlyRate', () => {
    expect(annualizeNominal(nominalMonthlyRate(0.085))).toBeCloseTo(0.085, 12);
  });

  it('annualizeEffective inverts effectiveMonthlyRate', () => {
    expect(annualizeEffective(effectiveMonthlyRate(0.085))).toBeCloseTo(0.085, 10);
  });
});
