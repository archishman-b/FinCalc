/**
 * A hash router in ~30 lines rather than a routing library. Five doors plus
 * a handful of Tier-1 calculators (Phase 6+) is not enough surface to
 * justify the dependency yet, and `#/comparator` is exactly as bookmarkable
 * and shareable as anything react-router would give here — brief §4's URL
 * requirement is really about *scenario* state (Phase 8's compressed
 * encoding), not the route itself. Revisit if Phase 6's Tier 1 grid needs
 * nested/parameterised routes this can't express cleanly.
 */
import { useEffect, useState } from 'react';

export type RouteId =
  | 'home'
  | 'afford'
  | 'rent-vs-buy'
  | 'comparator'
  | 'retirement'
  | 'calculators'
  | 'calc-emi'
  | 'calc-loan-refinance'
  | 'calc-sip'
  | 'calc-fixed-income'
  | 'calc-income-tax'
  | 'calc-capital-gains'
  | 'calc-inflation';

const VALID_ROUTES: readonly RouteId[] = [
  'home',
  'afford',
  'rent-vs-buy',
  'comparator',
  'retirement',
  'calculators',
  'calc-emi',
  'calc-loan-refinance',
  'calc-sip',
  'calc-fixed-income',
  'calc-income-tax',
  'calc-capital-gains',
  'calc-inflation',
];

function isRouteId(value: string): value is RouteId {
  return (VALID_ROUTES as readonly string[]).includes(value);
}

function parseHash(): RouteId {
  const raw = window.location.hash.replace(/^#\/?/, '');
  return isRouteId(raw) ? raw : 'home';
}

/** Pushes a new route onto the URL hash. `'home'` clears the hash entirely rather than writing `#/home`. */
export function navigate(route: RouteId): void {
  window.location.hash = route === 'home' ? '' : `/${route}`;
  if (route === 'home') window.scrollTo(0, 0);
}

/** The current route, re-rendering on browser back/forward and on `navigate()`. */
export function useRoute(): RouteId {
  const [route, setRoute] = useState<RouteId>(() => (typeof window === 'undefined' ? 'home' : parseHash()));

  useEffect(() => {
    const onHashChange = () => setRoute(parseHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  return route;
}
