import { beforeEach, describe, expect, it } from 'vitest';

import { deleteSavedScenario, listSavedScenarios, saveScenario, type KeyValueStore } from './saved-scenarios';
import type { LayerOneInputs } from './scenario-builder';

const INPUTS: LayerOneInputs = {
  city: 'hyderabad',
  monthlyHouseholdIncomeNet: 450_000,
  monthlyHousingBudget: 155_000,
  horizonYears: 15,
};

/** A plain in-memory KeyValueStore — no jsdom/localStorage needed, per this module's own doc comment on why storage is behind an interface. */
function memoryStore(): KeyValueStore {
  const backing = new Map<string, string>();
  return {
    getItem: (key) => backing.get(key) ?? null,
    setItem: (key, value) => {
      backing.set(key, value);
    },
    removeItem: (key) => {
      backing.delete(key);
    },
  };
}

/** A store that always throws — simulates Safari private-browsing / a full quota. */
function throwingStore(): KeyValueStore {
  return {
    getItem: () => {
      throw new Error('storage disabled');
    },
    setItem: () => {
      throw new Error('storage disabled');
    },
    removeItem: () => {
      throw new Error('storage disabled');
    },
  };
}

let store: KeyValueStore;

beforeEach(() => {
  store = memoryStore();
});

describe('saved-scenarios — save and list', () => {
  it('starts empty', () => {
    expect(listSavedScenarios(store)).toEqual([]);
  });

  it('saves a scenario and lists it back with the exact inputs', () => {
    saveScenario('Base case', INPUTS, store);
    const list = listSavedScenarios(store);
    expect(list).toHaveLength(1);
    expect(list[0]!.name).toBe('Base case');
    expect(list[0]!.inputs).toEqual(INPUTS);
  });

  it('trims whitespace from the name and rejects an empty/whitespace-only name', () => {
    const saved = saveScenario('  Padded name  ', INPUTS, store);
    expect(saved?.name).toBe('Padded name');

    expect(saveScenario('   ', INPUTS, store)).toBeNull();
    expect(listSavedScenarios(store)).toHaveLength(1); // the rejected save didn't add anything
  });

  it('lists newest first', () => {
    saveScenario('First', { ...INPUTS, horizonYears: 5 }, store);
    saveScenario('Second', { ...INPUTS, horizonYears: 10 }, store);
    const names = listSavedScenarios(store).map((s) => s.name);
    expect(names).toEqual(['Second', 'First']);
  });

  it('saving a scenario with an existing name overwrites it in place rather than duplicating it', () => {
    const first = saveScenario('Base case', INPUTS, store);
    const second = saveScenario('Base case', { ...INPUTS, horizonYears: 25 }, store);
    const list = listSavedScenarios(store);
    expect(list).toHaveLength(1);
    expect(list[0]!.id).toBe(first?.id);
    expect(list[0]!.id).toBe(second?.id);
    expect(list[0]!.inputs.horizonYears).toBe(25);
  });
});

describe('saved-scenarios — delete', () => {
  it('deletes a saved scenario by id', () => {
    const saved = saveScenario('Base case', INPUTS, store)!;
    expect(deleteSavedScenario(saved.id, store)).toBe(true);
    expect(listSavedScenarios(store)).toEqual([]);
  });

  it('deleting an id that does not exist is a no-op that reports false', () => {
    expect(deleteSavedScenario('does-not-exist', store)).toBe(false);
  });
});

describe('saved-scenarios — storage failures degrade gracefully', () => {
  it('listSavedScenarios returns an empty list rather than throwing when the store throws', () => {
    expect(() => listSavedScenarios(throwingStore())).not.toThrow();
    expect(listSavedScenarios(throwingStore())).toEqual([]);
  });

  it('saveScenario returns null rather than throwing when the store throws', () => {
    expect(() => saveScenario('Base case', INPUTS, throwingStore())).not.toThrow();
    expect(saveScenario('Base case', INPUTS, throwingStore())).toBeNull();
  });

  it('a null store (no window / storage unavailable) behaves as empty and read-only', () => {
    expect(listSavedScenarios(null)).toEqual([]);
    expect(saveScenario('Base case', INPUTS, null)).toBeNull();
    expect(deleteSavedScenario('anything', null)).toBe(false);
  });

  it('treats corrupt JSON under the storage key as an empty list rather than throwing', () => {
    store.setItem('fincalc:scenarios:v1', '{not valid json');
    expect(listSavedScenarios(store)).toEqual([]);
  });

  it('filters out malformed entries in an otherwise-valid array rather than rejecting the whole list', () => {
    store.setItem(
      'fincalc:scenarios:v1',
      JSON.stringify([
        { id: 'a', name: 'Valid', savedAt: new Date().toISOString(), inputs: INPUTS },
        { id: 'b', name: 'Missing inputs' },
        'not even an object',
      ]),
    );
    const list = listSavedScenarios(store);
    expect(list).toHaveLength(1);
    expect(list[0]!.id).toBe('a');
  });
});
