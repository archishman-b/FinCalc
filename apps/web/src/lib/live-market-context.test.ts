import { describe, expect, it, vi } from 'vitest';

import type { LiveRateProvider, LiveRateSnapshot } from './live-market-context';
import { resolveLiveMarketContext } from './live-market-context';
import type { KeyValueStore } from './saved-scenarios';

/** A plain in-memory KeyValueStore mock — the same pattern saved-scenarios.test.ts and
 * scenario-url.test.ts already use, so these tests need no jsdom/localStorage either. */
function memoryStore(): KeyValueStore {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
  };
}

const BASE_CTX = {
  rate: (series: string) => (series === 'rates.repo' ? 0.055 : 0.08),
  provenance: (series: string) => ({ origin: 'default' as const, label: `Static default for ${series}`, verifiedOn: '2026-09-01' }),
};

function snapshot(overrides: Partial<LiveRateSnapshot> = {}): LiveRateSnapshot {
  return { rate: 0.065, asOf: '2026-09-14', sourceUrl: 'https://example.test/rate', sourceLabel: 'Example source', ...overrides };
}

function provider(overrides: Partial<LiveRateProvider> = {}): LiveRateProvider {
  return {
    id: 'test-provider',
    series: 'rates.repo',
    label: 'Test provider',
    fetchLatest: async () => snapshot(),
    ...overrides,
  };
}

describe('resolveLiveMarketContext', () => {
  it('falls through to the base context unchanged when no providers are given', async () => {
    const { ctx, statuses } = await resolveLiveMarketContext(BASE_CTX, []);
    expect(ctx.rate('rates.repo', 1)).toBe(0.055);
    expect(ctx.provenance('rates.repo').origin).toBe('default');
    expect(statuses).toEqual([]);
  });

  it('uses a successful live fetch and marks it as live provenance', async () => {
    const { ctx, statuses } = await resolveLiveMarketContext(BASE_CTX, [provider()], { store: memoryStore() });
    expect(ctx.rate('rates.repo', 1)).toBe(0.065);
    expect(ctx.provenance('rates.repo').origin).toBe('live');
    expect(ctx.provenance('rates.repo').url).toBe('https://example.test/rate');
    expect(statuses).toHaveLength(1);
    expect(statuses[0]!.state).toBe('live');
  });

  it('leaves series with no provider untouched', async () => {
    const { ctx } = await resolveLiveMarketContext(BASE_CTX, [provider()], { store: memoryStore() });
    expect(ctx.rate('property.appreciation', 1)).toBe(0.08);
    expect(ctx.provenance('property.appreciation').origin).toBe('default');
  });

  it('falls back to the base context when a provider throws and no cache exists', async () => {
    const failing = provider({ fetchLatest: async () => { throw new Error('network down'); } });
    const { ctx, statuses } = await resolveLiveMarketContext(BASE_CTX, [failing], { store: memoryStore() });
    expect(ctx.rate('rates.repo', 1)).toBe(0.055);
    expect(ctx.provenance('rates.repo').origin).toBe('default');
    expect(statuses[0]!.state).toBe('fallback');
    expect(statuses[0]!.reason).toContain('network down');
  });

  it('falls back to the base context when a provider times out', async () => {
    const hung = provider({
      fetchLatest: (signal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    });
    const { ctx, statuses } = await resolveLiveMarketContext(BASE_CTX, [hung], { store: memoryStore(), timeoutMs: 10 });
    expect(ctx.rate('rates.repo', 1)).toBe(0.055);
    expect(statuses[0]!.state).toBe('fallback');
  });

  it('rejects an implausible fetched value rather than trusting it blindly', async () => {
    const garbage = provider({ fetchLatest: async () => snapshot({ rate: 4.5 }) as LiveRateSnapshot }); // 450%/year — not real
    const { ctx, statuses } = await resolveLiveMarketContext(BASE_CTX, [garbage], { store: memoryStore() });
    expect(ctx.rate('rates.repo', 1)).toBe(0.055);
    expect(statuses[0]!.state).toBe('fallback');
    expect(statuses[0]!.reason).toContain('plausibility');
  });

  it('never attempts a fetch while offline, and falls back to base with no cache', async () => {
    const fetchSpy = vi.fn(async () => snapshot());
    const { ctx, statuses } = await resolveLiveMarketContext(BASE_CTX, [provider({ fetchLatest: fetchSpy })], {
      store: memoryStore(),
      isOnline: () => false,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(ctx.rate('rates.repo', 1)).toBe(0.055);
    expect(statuses[0]!.state).toBe('fallback');
    expect(statuses[0]!.reason).toContain('offline');
  });

  it('serves a stale cached value (not the generic default) when offline but a prior live fetch succeeded', async () => {
    const store = memoryStore();
    // First resolution: online, succeeds, populates the cache.
    await resolveLiveMarketContext(BASE_CTX, [provider()], { store });
    // Second resolution: offline now, but the cache from before should still be preferred over the static default.
    const { ctx, statuses } = await resolveLiveMarketContext(BASE_CTX, [provider()], { store, isOnline: () => false });
    expect(ctx.rate('rates.repo', 1)).toBe(0.065);
    expect(statuses[0]!.state).toBe('stale-cache');
    expect(ctx.provenance('rates.repo').label).toContain('currently unreachable');
  });

  it('serves a stale cached value when a fresh fetch fails but an earlier one had succeeded', async () => {
    const store = memoryStore();
    await resolveLiveMarketContext(BASE_CTX, [provider()], { store });
    const nowFailing = provider({ fetchLatest: async () => { throw new Error('server error'); } });
    const { ctx, statuses } = await resolveLiveMarketContext(BASE_CTX, [nowFailing], { store, cacheTtlMs: 0 });
    expect(ctx.rate('rates.repo', 1)).toBe(0.065);
    expect(statuses[0]!.state).toBe('stale-cache');
    expect(statuses[0]!.reason).toContain('server error');
  });

  it('reuses a fresh cache without re-fetching', async () => {
    const store = memoryStore();
    await resolveLiveMarketContext(BASE_CTX, [provider()], { store });
    const fetchSpy = vi.fn(async () => snapshot({ rate: 0.099 }));
    const { ctx, statuses } = await resolveLiveMarketContext(BASE_CTX, [provider({ fetchLatest: fetchSpy })], {
      store,
      cacheTtlMs: 60_000,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(ctx.rate('rates.repo', 1)).toBe(0.065); // the cached value, not fetchSpy's 0.099
    expect(statuses[0]!.state).toBe('live');
  });

  it('re-fetches once the cache TTL has expired', async () => {
    const store = memoryStore();
    await resolveLiveMarketContext(BASE_CTX, [provider()], { store });
    const fetchSpy = vi.fn(async () => snapshot({ rate: 0.099 }));
    const { ctx } = await resolveLiveMarketContext(BASE_CTX, [provider({ fetchLatest: fetchSpy })], {
      store,
      cacheTtlMs: 0, // already expired
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(ctx.rate('rates.repo', 1)).toBe(0.099);
  });

  it('resolves multiple providers independently — one failing does not affect another succeeding', async () => {
    const good = provider({ id: 'good', series: 'rates.repo', fetchLatest: async () => snapshot({ rate: 0.06 }) });
    const bad = provider({ id: 'bad', series: 'equity.index_total_return', fetchLatest: async () => { throw new Error('down'); } });
    const { ctx, statuses } = await resolveLiveMarketContext(BASE_CTX, [good, bad], { store: memoryStore() });
    expect(ctx.rate('rates.repo', 1)).toBe(0.06);
    expect(ctx.provenance('rates.repo').origin).toBe('live');
    expect(ctx.rate('equity.index_total_return', 1)).toBe(0.08); // base's default for any series other than rates.repo
    expect(ctx.provenance('equity.index_total_return').origin).toBe('default');
    expect(statuses).toHaveLength(2);
  });

  it('degrades gracefully when sessionStorage is unavailable (no store injected, no window)', async () => {
    // options.store left undefined and no `window` in this test environment (no jsdom) —
    // defaultSessionStore() should return null rather than throw, and resolution should
    // still work correctly (just without caching).
    const { ctx, statuses } = await resolveLiveMarketContext(BASE_CTX, [provider()]);
    expect(ctx.rate('rates.repo', 1)).toBe(0.065);
    expect(statuses[0]!.state).toBe('live');
  });

  it('a storage backend that throws on every call still resolves correctly, just without caching', async () => {
    const throwingStore: KeyValueStore = {
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
    const { ctx, statuses } = await resolveLiveMarketContext(BASE_CTX, [provider()], { store: throwingStore });
    expect(ctx.rate('rates.repo', 1)).toBe(0.065);
    expect(statuses[0]!.state).toBe('live');
  });
});
