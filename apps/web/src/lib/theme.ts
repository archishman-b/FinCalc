/**
 * The design plan's palette as JS constants, for the one place CSS custom
 * properties don't reliably reach: SVG presentation attributes inside
 * Recharts. Kept in sync by hand with the `:root` values in index.css —
 * six short hex pairs, not worth a build-time generation step for.
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
  paper: '#faf7f2',
  ink: '#1c1a17',
  inkMuted: '#6b6459',
  rust: '#b5482e',
  moss: '#3f6b4f',
  ochre: '#a67425',
  hairline: '#e4ddd1',
};

export const DARK_PALETTE: Palette = {
  paper: '#17140f',
  ink: '#f2ede4',
  inkMuted: '#a89e8d',
  rust: '#d6683f',
  moss: '#5c9271',
  ochre: '#d2a245',
  hairline: '#332c22',
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
