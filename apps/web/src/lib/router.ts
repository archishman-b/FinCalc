/**
 * A hash router in ~30 lines rather than a routing library. With the app
 * narrowed to two modules (REIT income, SIP & SWP) plus a landing page,
 * there's even less surface here than when this file originally argued
 * against a routing dependency — `#/calc-reit-portfolio` is exactly as
 * bookmarkable and shareable as anything react-router would give.
 *
 * Pruned down from the original nine-route app (the flagship Comparator,
 * the Tier 1 grid and its eight calculators) per the decision to ship only
 * the two Graphite modules — see claude/decisions-and-workflow.md.
 */
import { useEffect, useState } from 'react';

export type RouteId = 'home' | 'calc-reit-portfolio' | 'calc-sip-swp';

const VALID_ROUTES: readonly RouteId[] = ['home', 'calc-reit-portfolio', 'calc-sip-swp'];

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
