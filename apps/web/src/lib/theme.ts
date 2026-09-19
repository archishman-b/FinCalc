/**
 * The design plan's palette as JS constants, for the one place CSS custom
 * properties don't reliably reach: SVG presentation attributes inside
 * Recharts. Kept in sync by hand with the `:root` values in index.css —
 * six short hex pairs, not worth a build-time generation step for.
 *
 * Re-themed alongside index.css's own re-theme (see that file's top
 * comment for why): cool near-white/near-black ground, cobalt accent
 * instead of terracotta rust. The `rust` field name is unchanged for the
 * same reason index.css keeps `--rust` — renaming it would ripple into
 * every chart call site that reads `palette.rust`.
 */
import { useEffect, useState } from 'react';

export interface Palette {
  paper: string;
  ink: string;
  inkMuted: string;
  rust: string;
  moss: string;
  ochre: string;
  hairline: string;
}

export const LIGHT_PALETTE: Palette = {
  paper: '#fafbfc',
  ink: '#101317',
  inkMuted: '#667085',
  rust: '#2451a3',
  moss: '#3f6b4f',
  ochre: '#a67425',
  hairline: '#e2e5e9',
};

export const DARK_PALETTE: Palette = {
  paper: '#0e1114',
  ink: '#f1f3f5',
  inkMuted: '#97a1b0',
  rust: '#4a7fdb',
  moss: '#5c9271',
  ochre: '#d2a245',
  hairline: '#262b31',
};

/** Tracks `prefers-color-scheme` live, so a chart repaints if the OS theme changes without a reload. */
export function usePalette(): Palette {
  const [dark, setDark] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches,
  );

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setDark(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return dark ? DARK_PALETTE : LIGHT_PALETTE;
}
