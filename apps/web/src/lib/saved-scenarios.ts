/**
 * Phase 8 (brief §4): "Named scenarios saved to localStorage." A saved
 * scenario is just a name plus the Layer-1 inputs that reproduce it —
 * loading one re-runs buildLayerOneComparison from scratch rather than
 * freezing a result, so a saved scenario always reflects the engine's
 * current assumptions and data packs, not whatever they were the day it
 * was saved (the same "live, not a snapshot" property the URL-encoded
 * link has).
 *
 * Storage is behind a small KeyValueStore interface rather than calling
 * `localStorage` directly, for two reasons: (1) it's directly unit
 * testable with a plain in-memory object, no jsdom dependency needed —
 * see the module doc in vitest.config.ts; (2) `localStorage` throws in a
 * handful of real situations (Safari private browsing, a full quota,
 * disabled storage in a locked-down browser) and every call here is
 * wrapped so a storage failure degrades to "scenario saving isn't
 * available right now" rather than crashing the Comparator.
 *
 * Deliberately out of scope for Phase 8 (brief §3's "compare up to four
 * scenarios side by side" is the flagship Comparator's own Tier 2 scope —
 * right now the Comparator always runs exactly the Buy/Rent pair, see
 * scenario-builder.ts's module doc): "Load" replaces the current Layer-1
 * form's inputs with a saved scenario's, one at a time. A saved scenario
 * is a shortcut back to a set of inputs, not yet a slot in a multi-way
 * comparison.
 */
import type { LayerOneInputs } from './scenario-builder';

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface SavedScenario {
  id: string;
  name: string;
  /** ISO timestamp. */
  savedAt: string;
  inputs: LayerOneInputs;
}

const STORAGE_KEY = 'fincalc:scenarios:v1';
/** A generous but real cap — this is a convenience list, not a database, and an unbounded list makes the "Saved scenarios" panel unusable long before it makes localStorage's ~5MB quota a problem. */
const MAX_SAVED_SCENARIOS = 50;

function defaultStore(): KeyValueStore | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    // Some browsers throw merely *accessing* localStorage under certain privacy settings.
    return null;
  }
}

function isLayerOneInputs(value: unknown): value is LayerOneInputs {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.city === 'string' &&
    typeof v.monthlyHouseholdIncomeNet === 'number' &&
    typeof v.monthlyHousingBudget === 'number' &&
    typeof v.horizonYears === 'number'
  );
}

function isSavedScenario(value: unknown): value is SavedScenario {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.id === 'string' && typeof v.name === 'string' && typeof v.savedAt === 'string' && isLayerOneInputs(v.inputs);
}

function readAll(store: KeyValueStore | null): SavedScenario[] {
  if (!store) return [];
  try {
    const raw = store.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isSavedScenario);
  } catch {
    // Corrupt or foreign data under our key — treat as empty rather than throw; the next successful save overwrites it cleanly.
    return [];
  }
}

function writeAll(store: KeyValueStore | null, scenarios: SavedScenario[]): boolean {
  if (!store) return false;
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(scenarios));
    return true;
  } catch {
    // Quota exceeded, storage disabled, or private-browsing restrictions — the caller decides how to surface this.
    return false;
  }
}

/** All saved scenarios, newest first. */
export function listSavedScenarios(store: KeyValueStore | null = defaultStore()): SavedScenario[] {
  return readAll(store).sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

/**
 * Saves (or, if a scenario with the same name already exists, overwrites)
 * a named scenario. Returns the saved record, or null if storage isn't
 * available/writable — the caller should tell the user rather than
 * silently pretending it worked.
 */
export function saveScenario(
  name: string,
  inputs: LayerOneInputs,
  store: KeyValueStore | null = defaultStore(),
): SavedScenario | null {
  const trimmedName = name.trim();
  if (!trimmedName) return null;

  const existing = readAll(store);
  const record: SavedScenario = {
    id: existing.find((s) => s.name === trimmedName)?.id ?? `scn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: trimmedName,
    savedAt: new Date().toISOString(),
    inputs,
  };

  const withoutSameName = existing.filter((s) => s.name !== trimmedName);
  const next = [record, ...withoutSameName].slice(0, MAX_SAVED_SCENARIOS);
  return writeAll(store, next) ? record : null;
}

/** Deletes a saved scenario by id. A no-op (returns false) if it didn't exist or storage isn't writable. */
export function deleteSavedScenario(id: string, store: KeyValueStore | null = defaultStore()): boolean {
  const existing = readAll(store);
  const next = existing.filter((s) => s.id !== id);
  if (next.length === existing.length) return false;
  return writeAll(store, next);
}
