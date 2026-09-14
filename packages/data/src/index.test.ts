import { describe, expect, it } from 'vitest';

import { getRulePack, listRulePacks, parseRulePack } from './index';

const fixture = {
  id: 'fixture-pack',
  fy: '2026-27',
  effectiveFrom: '2026-04-01',
  provenance: { source: 'https://example.org/notification', verifiedOn: '2026-09-14' },
  rules: { example: { value: 0.3 } },
};

describe('@fincalc/data rule-pack envelope', () => {
  it('accepts a pack with full provenance', () => {
    const pack = parseRulePack(fixture);
    expect(pack.jurisdiction).toBe('IN');
    expect(pack.provenance.verifiedOn).toBe('2026-09-14');
  });

  it('rejects a pack whose provenance is missing a verifiedOn date', () => {
    const { provenance, ...rest } = fixture;
    expect(() => parseRulePack({ ...rest, provenance: { source: provenance.source } })).toThrow();
  });

  it('rejects a malformed financial-year label', () => {
    expect(() => parseRulePack({ ...fixture, fy: 'FY26' })).toThrow();
  });

  it('ships no packs in Phase 0 and every registered pack validates', () => {
    const packs = listRulePacks();
    expect(packs).toHaveLength(0);
    for (const pack of packs) expect(() => parseRulePack(pack)).not.toThrow();
    expect(getRulePack('2026-27')).toBeUndefined();
  });
});
