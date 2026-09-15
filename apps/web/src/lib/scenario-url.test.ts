import { describe, expect, it } from 'vitest';

import {
  buildShareUrl,
  decodeScenarioState,
  encodeScenarioState,
  readScenarioStateFromSearch,
} from './scenario-url';
import type { LayerOneInputs } from './scenario-builder';

const SAMPLE: LayerOneInputs = {
  city: 'hyderabad',
  monthlyHouseholdIncomeNet: 450_000,
  monthlyHousingBudget: 155_000,
  horizonYears: 15,
};

describe('scenario-url — round trip', () => {
  it('decodes exactly what it encoded', () => {
    const token = encodeScenarioState(SAMPLE);
    expect(decodeScenarioState(token)).toEqual(SAMPLE);
  });

  it('produces a URL-safe token (no +, /, or = characters)', () => {
    // Push values likely to produce base64's special characters so the URL-safe substitution is actually exercised, not just coincidentally unnecessary.
    const token = encodeScenarioState({ ...SAMPLE, monthlyHouseholdIncomeNet: 123_456, monthlyHousingBudget: 987_654 });
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('round-trips every supported horizon', () => {
    for (const horizonYears of [5, 10, 15, 25] as const) {
      const token = encodeScenarioState({ ...SAMPLE, horizonYears });
      expect(decodeScenarioState(token)?.horizonYears).toBe(horizonYears);
    }
  });
});

describe('scenario-url — decoding untrusted input', () => {
  it('never throws on garbage input', () => {
    expect(() => decodeScenarioState('not-valid-base64!!!')).not.toThrow();
    expect(() => decodeScenarioState('')).not.toThrow();
  });

  it('returns null for a token that is not valid base64url JSON at all', () => {
    expect(decodeScenarioState('%%%not-base64%%%')).toBeNull();
  });

  it('drops an out-of-range horizon rather than accepting it', () => {
    const token = encodeScenarioState({ ...SAMPLE, horizonYears: 15 });
    // Tamper with the decoded JSON to smuggle an unsupported horizon, re-encode, and confirm it's rejected rather than silently trusted.
    const tampered = encodeScenarioState({ ...SAMPLE, horizonYears: 999 as unknown as LayerOneInputs['horizonYears'] });
    expect(decodeScenarioState(tampered)?.horizonYears).toBeUndefined();
    expect(decodeScenarioState(token)?.horizonYears).toBe(15);
  });

  it('drops a non-positive or non-finite income/budget rather than accepting it', () => {
    const negativeIncome = encodeScenarioState({ ...SAMPLE, monthlyHouseholdIncomeNet: -5 });
    expect(decodeScenarioState(negativeIncome)?.monthlyHouseholdIncomeNet).toBeUndefined();

    const infiniteBudget = encodeScenarioState({ ...SAMPLE, monthlyHousingBudget: Infinity });
    expect(decodeScenarioState(infiniteBudget)?.monthlyHousingBudget).toBeUndefined();
  });

  it('drops an unrecognised city rather than accepting it', () => {
    const token = encodeScenarioState({ ...SAMPLE, city: 'mumbai' as unknown as LayerOneInputs['city'] });
    expect(decodeScenarioState(token)?.city).toBeUndefined();
  });

  it('returns only the fields that did validate, not the whole object, when one field is bad', () => {
    const token = encodeScenarioState({ ...SAMPLE, horizonYears: 999 as unknown as LayerOneInputs['horizonYears'] });
    const decoded = decodeScenarioState(token);
    expect(decoded?.monthlyHouseholdIncomeNet).toBe(SAMPLE.monthlyHouseholdIncomeNet);
    expect(decoded?.monthlyHousingBudget).toBe(SAMPLE.monthlyHousingBudget);
    expect(decoded?.horizonYears).toBeUndefined();
  });
});

describe('scenario-url — search string and full URL helpers', () => {
  it('readScenarioStateFromSearch reads the s param out of a query string', () => {
    const token = encodeScenarioState(SAMPLE);
    expect(readScenarioStateFromSearch(`?s=${token}&other=1`)).toEqual(SAMPLE);
  });

  it('readScenarioStateFromSearch returns null when the s param is absent', () => {
    expect(readScenarioStateFromSearch('?other=1')).toBeNull();
  });

  it('buildShareUrl sets the s param while preserving the rest of the URL, including the hash', () => {
    const url = buildShareUrl(SAMPLE, 'https://archishman.com/FinCalc/#/comparator');
    const parsed = new URL(url);
    expect(parsed.hash).toBe('#/comparator');
    expect(decodeScenarioState(parsed.searchParams.get('s') ?? '')).toEqual(SAMPLE);
  });

  it('buildShareUrl overwrites a pre-existing s param rather than duplicating it', () => {
    const first = buildShareUrl(SAMPLE, 'https://archishman.com/FinCalc/?s=stale#/comparator');
    const params = new URL(first).searchParams;
    expect(params.getAll('s')).toHaveLength(1);
  });
});
