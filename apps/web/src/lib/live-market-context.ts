/**
 * Phase 9 (brief §3 Tier 3 / §6): "MarketContext live adapters | Rates and
 * index data injectable, with graceful offline fallback."
 *
 * `MarketContext` (packages/engine/src/types.ts) was designed since Phase 0
 * to make a live feed and a hardcoded default interchangeable: `rate(series,
 * month)` is just a lookup, and `AssumptionOrigin` already includes `'live'`
 * as an option nobody had implemented yet. This file is that implementation
 * — a decorator that wraps any existing `MarketContext` (the static
 * bear/base/bull packs already used everywhere) with an optional set of
 * live rate providers, falling back to the wrapped context whenever a live
 * value isn't available, isn't trustworthy, or the browser is offline.
 *
 * IMPORTANT — why zero real providers ship enabled by default: this
 * project's whole discipline is "never type a tax or rate figure from
 * memory, look it up and cite it" (see claude/decisions-and-workflow.md).
 * The same discipline has to apply to *this* kind of fact too — "this API
 * can be called directly from a browser" is itself a claim that needs
 * verifying, not assuming. Every outbound network path available this
 * session (the cloud sandbox's proxy, and the linked Mac's own egress) is
 * allowlisted and blocks every candidate public finance API tested
 * (AMFI, World Bank, RBI, Frankfurter, NSE) — so whether any of them
 * actually sends `Access-Control-Allow-Origin` for a real browser fetch
 * from archishman.com could not be confirmed here, only guessed. Rather
 * than wire one in and call Phase 9 "done" on a guess, this ships the
 * *mechanism* — genuinely injectable, genuinely tested, genuinely graceful
 * — with an empty provider list, so today's behaviour is unchanged (100%
 * static, exactly as every prior phase) until someone verifies a specific
 * endpoint directly in a real browser and adds a `LiveRateProvider` for it.
 *
 * The one thing this file structurally cannot do anything about: fetching
 * is inherently asynchronous, but `MarketContext.rate()` is a synchronous
 * per-month lookup called deep inside pure `Position.project()` code. So
 * live values must be resolved *before* a `MarketContext` is built, not
 * inside `rate()` itself — `resolveLiveMarketContext()` below does all its
 * fetching up front and hands back an ordinary synchronous `MarketContext`.
 * A caller (e.g. a future "Refresh live rates" UI action) awaits it once,
 * then passes the resulting context into `compare()`/`buildLayerOneComparison()`
 * exactly as it would the static default today.
 */
import type { AnnualRate, MarketContext, Month, Provenance, SeriesId } from '@fincalc/engine';

import type { KeyValueStore } from './saved-scenarios';

/** What a provider hands back for one series: a single current rate, not a path — a live feed gives "the repo rate right now", applied flat across the whole horizon, the same way a user-entered assumption would be. */
export interface LiveRateSnapshot {
  rate: AnnualRate;
  /** ISO date the source itself says this value is as-of (not when we fetched it) — falls back to the fetch time if the source doesn't say. */
  asOf: string;
  sourceUrl: string;
  sourceLabel: string;
}

/** One live data source for one series. Deliberately narrow — a provider only has to know how to fetch and parse its own series; every retry/timeout/offline/staleness/cache concern below is shared plumbing a provider author never has to reimplement. */
export interface LiveRateProvider {
  id: string;
  series: SeriesId;
  label: string;
  /** Must respect `signal` — resolveLiveMarketContext aborts it on timeout. Should throw (not return a sentinel) on any failure; the wrapper treats a thrown error exactly like a timeout. */
  fetchLatest(signal: AbortSignal): Promise<LiveRateSnapshot>;
}

export type LiveResolutionState = 'live' | 'stale-cache' | 'fallback';

/** One row per provider, after a resolution pass — enough for a future "Live data" UI strip to say what actually happened, without guessing. */
export interface LiveStatus {
  series: SeriesId;
  providerId: string;
  providerLabel: string;
  state: LiveResolutionState;
  /** Present whenever state !== 'live': why the live value wasn't used this time. */
  reason?: string;
  attemptedAt: string;
}

interface CachedSnapshot {
  snapshot: LiveRateSnapshot;
  cachedAt: string;
}

/** Same injectable-store shape as saved-scenarios.ts's KeyValueStore, reused rather than duplicated — see that file's own doc comment for why storage is injected instead of touched directly. sessionStorage (not localStorage) is the intended default here: "the repo rate as of this browsing session" is the right lifetime for a live snapshot, not "forever until explicitly cleared". */
function defaultSessionStore(): KeyValueStore | null {
  if (typeof window === 'undefined') return null;
  try {
    const store = window.sessionStorage;
    const probeKey = '__fincalc_live_probe__';
    store.setItem(probeKey, '1');
    store.removeItem(probeKey);
    return store;
  } catch {
    return null;
  }
}

const CACHE_KEY_PREFIX = 'fincalc:live-rate:v1:';

function readCache(store: KeyValueStore | null, providerId: string): CachedSnapshot | null {
  if (!store) return null;
  try {
    const raw = store.getItem(CACHE_KEY_PREFIX + providerId);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const candidate = parsed as Record<string, unknown>;
    const snapshot = candidate.snapshot as Record<string, unknown> | undefined;
    if (
      typeof candidate.cachedAt !== 'string' ||
      !snapshot ||
      typeof snapshot.rate !== 'number' ||
      !Number.isFinite(snapshot.rate) ||
      typeof snapshot.asOf !== 'string' ||
      typeof snapshot.sourceUrl !== 'string' ||
      typeof snapshot.sourceLabel !== 'string'
    ) {
      return null;
    }
    return {
      cachedAt: candidate.cachedAt,
      snapshot: {
        rate: snapshot.rate,
        asOf: snapshot.asOf,
        sourceUrl: snapshot.sourceUrl,
        sourceLabel: snapshot.sourceLabel,
      },
    };
  } catch {
    return null;
  }
}

function writeCache(store: KeyValueStore | null, providerId: string, entry: CachedSnapshot): void {
  if (!store) return;
  try {
    store.setItem(CACHE_KEY_PREFIX + providerId, JSON.stringify(entry));
  } catch {
    // Storage can throw (quota, private browsing) — a failed cache write just means the
    // next resolution re-fetches instead of reusing it. Never let it break the caller.
  }
}

/** A fetched rate is still just a number from the network — validated with the same "never trust blindly" discipline as a pasted scenario-share link (scenario-url.ts) or a hand-typed form value. -100%..+100% annual is generous on both sides (every real series this project models sits well inside it) but still rejects garbage (NaN, a misparsed percentage-as-decimal, a provider bug). */
function isPlausibleSnapshot(value: unknown): value is LiveRateSnapshot {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.rate === 'number' &&
    Number.isFinite(v.rate) &&
    v.rate > -1 &&
    v.rate < 1 &&
    typeof v.asOf === 'string' &&
    v.asOf.length > 0 &&
    typeof v.sourceUrl === 'string' &&
    v.sourceUrl.length > 0 &&
    typeof v.sourceLabel === 'string' &&
    v.sourceLabel.length > 0
  );
}

export interface ResolveLiveMarketContextOptions {
  /** Per-provider fetch timeout. Default 5000ms — generous for a single small JSON/text response, short enough that a hung provider never makes the Comparator feel broken. */
  timeoutMs?: number;
  /** How long a successful fetch is trusted before a fresh attempt is preferred over the cache. Default 6 hours — these are slow-moving series (a policy repo rate, a monthly CPI print), not intraday prices. */
  cacheTtlMs?: number;
  store?: KeyValueStore | null;
  /** Injectable for testing; defaults to `navigator.onLine` in a browser, `true` (assume reachable, let the fetch itself fail if it isn't) elsewhere. `navigator.onLine` is a fast-path skip only — it can be wrong (true with no real route to the internet), so it's never the only thing standing between a caller and a hung request; the timeout below is the real backstop. */
  isOnline?: () => boolean;
}

const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

function defaultIsOnline(): boolean {
  // Some non-browser JS runtimes (e.g. Node's built-in `navigator` global used by the test
  // runner here) expose a `navigator` object without a real `onLine` property. Trusting
  // `undefined` as falsy would silently treat every resolution as offline outside a real
  // browser, which is exactly the kind of unverifiable-fast-path failure this function's own
  // doc comment warns about — so only defer to `navigator.onLine` when it's an actual boolean.
  if (typeof navigator === 'undefined' || typeof navigator.onLine !== 'boolean') return true;
  return navigator.onLine;
}

async function fetchWithTimeout(provider: LiveRateProvider, timeoutMs: number): Promise<LiveRateSnapshot> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const snapshot = await provider.fetchLatest(controller.signal);
    if (!isPlausibleSnapshot(snapshot)) {
      throw new RangeError(`${provider.id}: fetched value failed plausibility checks`);
    }
    return snapshot;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Resolves every provider once (in parallel), then returns a synchronous
 * `MarketContext` — every series a provider covers reads from the resolved
 * live-or-cached-or-fallback table; every other series passes straight
 * through to `base` unchanged. Never throws: a provider that fails, times
 * out, or returns an implausible value degrades to its cached value (if any
 * cache entry exists, however old) and finally to `base` — the same
 * "narrow the failure, never crash the page" posture as `saved-scenarios.ts`
 * and `scenario-url.ts` from Phase 8.
 */
export async function resolveLiveMarketContext(
  base: MarketContext,
  providers: readonly LiveRateProvider[],
  options: ResolveLiveMarketContextOptions = {},
): Promise<{ ctx: MarketContext; statuses: LiveStatus[] }> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  const store = options.store !== undefined ? options.store : defaultSessionStore();
  const isOnline = options.isOnline ?? defaultIsOnline;

  const resolved = new Map<SeriesId, { rate: AnnualRate; provenance: Provenance }>();
  const statuses: LiveStatus[] = [];
  const attemptedAt = new Date().toISOString();
  const online = isOnline();

  await Promise.all(
    providers.map(async (provider) => {
      const cached = readCache(store, provider.id);
      const cacheIsFresh = cached !== null && Date.now() - Date.parse(cached.cachedAt) < cacheTtlMs;

      async function useSnapshot(snapshot: LiveRateSnapshot, state: LiveResolutionState, reason?: string) {
        resolved.set(provider.series, {
          rate: snapshot.rate,
          provenance: {
            origin: state === 'fallback' ? 'default' : 'live',
            label: state === 'stale-cache' ? `${snapshot.sourceLabel} (last known value, currently unreachable)` : snapshot.sourceLabel,
            url: snapshot.sourceUrl,
            verifiedOn: snapshot.asOf,
          },
        });
        statuses.push({
          series: provider.series,
          providerId: provider.id,
          providerLabel: provider.label,
          state,
          attemptedAt,
          ...(reason !== undefined ? { reason } : {}),
        });
      }

      // Offline is checked before cache freshness: being unreachable right now is worth
      // surfacing ('stale-cache', "currently unreachable") even when the cached value is
      // still within its freshness window — a fresh number doesn't mean the source is
      // actually reachable this instant, and the two facts (freshness vs. reachability)
      // are independent and both worth being honest about.
      if (!online) {
        if (cached) {
          await useSnapshot(cached.snapshot, 'stale-cache', 'Browser is offline; serving the last cached value.');
        } else {
          statuses.push({ series: provider.series, providerId: provider.id, providerLabel: provider.label, state: 'fallback', reason: 'Browser is offline and no cached value exists.', attemptedAt });
        }
        return;
      }

      if (cacheIsFresh && cached) {
        await useSnapshot(cached.snapshot, 'live');
        return;
      }

      try {
        const snapshot = await fetchWithTimeout(provider, timeoutMs);
        writeCache(store, provider.id, { snapshot, cachedAt: new Date().toISOString() });
        await useSnapshot(snapshot, 'live');
      } catch (err) {
        const reason = err instanceof Error ? err.message : 'Unknown fetch error';
        if (cached) {
          await useSnapshot(cached.snapshot, 'stale-cache', reason);
        } else {
          statuses.push({ series: provider.series, providerId: provider.id, providerLabel: provider.label, state: 'fallback', reason, attemptedAt });
        }
      }
    }),
  );

  const ctx: MarketContext = {
    rate(series: SeriesId, month: Month): AnnualRate {
      const hit = resolved.get(series);
      return hit ? hit.rate : base.rate(series, month);
    },
    provenance(series: SeriesId): Provenance {
      const hit = resolved.get(series);
      return hit ? hit.provenance : base.provenance(series);
    },
  };

  return { ctx, statuses };
}
