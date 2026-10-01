import { useEffect, useState } from 'react';

/**
 * Shared "Graphite terminal" visual identity for the REIT income and SIP &
 * SWP modules (ported from their hand-built prototypes — reit-simulator.html
 * and sip-swp-planner.html, both saved as project docs). Pulled out of
 * ReitPortfolioBuilder.tsx's original `.reit-graphite` block once a second
 * module needed the same tokens, toggle and wrapper class, rather than
 * duplicating it. Deliberately NOT touching the rest of FinCalc's paper/ink
 * theme (lib/theme.ts, index.css) — these two modules keep a visual
 * identity of their own, scoped entirely to the `.graphite` class below, so
 * no other route is affected.
 */
export type GraphiteTheme = 'light' | 'dark';

/**
 * CSS custom-property tokens, ported verbatim from the prototypes' `:root`
 * block (light and dark values unchanged). Three-tier cascade, same as the
 * prototypes: light defaults, then the OS dark preference, then an
 * explicit `data-theme` attribute — set by the header's toggle button —
 * that wins over the OS preference either way. Typography is the one
 * deliberate departure from the prototypes (Geist/Geist Mono from Google
 * Fonts): system-stack substitutes, per FinCalc's Phase 5 "nothing about
 * the visual system makes a network request" principle.
 */
export const GRAPHITE_CSS_VARS = `
.graphite {
  --paper:#F4F5F3; --panel:#F8F8F6; --rail:#FAFAF9; --sheet:#FFFFFF; --field:#FFFFFF; --head:#FFFFFF;
  --ink:#111418; --ink2:#343A42; --muted:#5A616B; --rule:#E1E3E0; --rule2:#C7CBC7;
  --accent:#D98A00; --acctext:#935C00; --onacc:#FFFFFF; --accent-soft:#FDF3E0;
  --warn:#B86A00; --warn-soft:#FCF1DE; --line2:#8A929E; --s3:#1F6FD1;
  --p1bg:#E3F1EB; --p1fg:#0B5A43; --p2bg:#E4EEFB; --p2fg:#1756A5; --p3bg:#FCEFD6; --p3fg:#7A4B00; --p4bg:#EEEFEC; --p4fg:#5A616B;
  background: var(--paper); color: var(--ink);
  font-family: ui-sans-serif, system-ui, sans-serif;
  font-variant-numeric: tabular-nums;
}
.graphite .num { font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; }
@media (prefers-color-scheme: dark) {
  .graphite:not([data-theme="light"]) {
    --paper:#0B0D10; --panel:#0F1216; --rail:#0D1013; --sheet:#12151A; --field:#0E1115; --head:#0B0D10;
    --ink:#ECEEF1; --ink2:#C3C9D1; --muted:#8C95A2; --rule:#232830; --rule2:#39414C;
    --accent:#F5A524; --acctext:#F5B547; --onacc:#1A1204; --accent-soft:#2A2210;
    --warn:#F5A524; --warn-soft:#2A2210; --line2:#7D8795; --s3:#5AB0FF;
    --p1bg:#1C2A25; --p1fg:#8FD9BE; --p2bg:#13263A; --p2fg:#8CC8FF; --p3bg:#34270C; --p3fg:#F5C46A; --p4bg:#1B1F26; --p4fg:#8C95A2;
  }
}
.graphite[data-theme="dark"] {
  --paper:#0B0D10; --panel:#0F1216; --rail:#0D1013; --sheet:#12151A; --field:#0E1115; --head:#0B0D10;
  --ink:#ECEEF1; --ink2:#C3C9D1; --muted:#8C95A2; --rule:#232830; --rule2:#39414C;
  --accent:#F5A524; --acctext:#F5B547; --onacc:#1A1204; --accent-soft:#2A2210;
  --warn:#F5A524; --warn-soft:#2A2210; --line2:#7D8795; --s3:#5AB0FF;
  --p1bg:#1C2A25; --p1fg:#8FD9BE; --p2bg:#13263A; --p2fg:#8CC8FF; --p3bg:#34270C; --p3fg:#F5C46A; --p4bg:#1B1F26; --p4fg:#8C95A2;
}
.graphite input[type=range] { accent-color: var(--accent); }
`;

const STORAGE_KEY = 'fincalc-graphite-theme';

function readStoredTheme(): GraphiteTheme | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'light' || v === 'dark' ? v : null;
  } catch {
    return null;
  }
}

/**
 * Resolves the Graphite modules' theme and exposes a toggle. An explicit
 * choice is persisted to localStorage and read fresh on every mount — the
 * REIT and SIP & SWP routes are separate lazy-loaded components, each
 * fully unmounted when you navigate away, so "the choice persists across
 * modules" means persisted storage, not in-memory React state survival
 * (the same mechanism the standalone prototypes used, since they were
 * separate HTML documents). Falls back to live OS preference — and keeps
 * tracking it — until the user explicitly toggles for the first time.
 */
export function useGraphiteTheme(): { theme: GraphiteTheme; toggle: () => void } {
  const [stored, setStored] = useState<GraphiteTheme | null>(() => readStoredTheme());
  const [osDark, setOsDark] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches,
  );

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setOsDark(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const theme: GraphiteTheme = stored ?? (osDark ? 'dark' : 'light');

  function toggle() {
    const next: GraphiteTheme = theme === 'dark' ? 'light' : 'dark';
    setStored(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // best-effort — a private/locked-down browser just won't persist the choice
    }
  }

  return { theme, toggle };
}

/** The Graphite chart hex values for a resolved theme — plain data, not a hook, since both modules now get `theme` from `useGraphiteTheme()` above rather than each tracking the OS preference independently. */
export function graphiteChartColors(theme: GraphiteTheme) {
  return theme === 'dark'
    ? { line2: '#8A929E', accent: '#F5A524', s3: '#5AB0FF', rule: '#232830', ink2: '#C3C9D1', paper: '#12151A' }
    : { line2: '#8A929E', accent: '#D98A00', s3: '#1F6FD1', rule: '#E1E3E0', ink2: '#343A42', paper: '#FFFFFF' };
}
