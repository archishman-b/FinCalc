import { useState } from 'react';

import { getCapitalGainsRules } from '@fincalc/data';

/**
 * Capital-gains and inflation assumptions shared across the Graphite
 * modules — pulled out of `ReitPortfolioBuilder.tsx`'s own local tax fields
 * once a second module (SIP & SWP) needed the identical rates, rather than
 * letting a household's slab rate, equity gains rate or inflation
 * assumption drift between the tools silently. EPF & VPF and NPS (Phase
 * 15/16) are lighter consumers — EPF & VPF uses only `slabRatePct` and
 * `inflationPct`; NPS uses only `inflationPct` — neither module's own
 * mechanics touch capital-gains rates. Persisted to
 * localStorage (the same per-viewer-conveniences pattern as
 * `lib/graphite-theme.ts`'s theme choice) so a rate the user tunes on one
 * module — their actual slab rate, say — is already filled in in the other,
 * without either module needing to know the other exists.
 *
 * Seeded from `@fincalc/data`'s `getCapitalGainsRules('2026-27')` rather
 * than hardcoded, so the *first* values shown are the pack's own sourced
 * figures — equity/REIT units share one 12.5%/20%/₹1.25L LTCG/STCG/exemption
 * structure this FY (`rules.equity`), and the SIP & SWP planner's "other"
 * holding category (hybrid/gold/international funds) gets its own 12.5%
 * LTCG rate with no exemption (`rules.otherAssets`) — see that pack's own
 * module doc comment for the citations. Slab rate (31.2% = 30% + 4% cess,
 * the new regime's top slab) and inflation (6%/year) are not sourced from
 * any data pack — they're a household's own assumption, same tier as this
 * project's other illustrative defaults, same tier as `sip-swp-assumptions.ts`'s
 * example holdings and allocation presets — a documented starting point,
 * not sourced data.
 *
 * Caveat (B3, deliberately NOT modelled here): the real ₹1.25L equity LTCG
 * exemption is one shared annual allowance across every equity-like gain a
 * person realises — direct equity, equity funds, REIT/InvIT units — not a
 * separate ₹1.25L for each. This store does not net exposure across
 * modules (each module takes `equityLtcgExemptionInr` as a plain input and
 * applies the full amount on its own), so running both the REIT and SIP &
 * SWP modules side by side and adding their results together would
 * double-count the exemption. Each module's own Assumptions panel states
 * this caveat in prose; it is not enforced in code, per the project's own
 * "caveat rather than silently guess a netting rule" decision.
 */
export interface SharedTaxSettings {
  /** Slab rate applied to debt-fund gains (always slab-taxed, post-April-2023 units) and to any "other asset" short-term gain. 30% + 4% cess = 31.2 is the new regime's top slab, assumed to already include cess. */
  slabRatePct: number;
  /** Flat long-term rate for equity holdings and REIT/InvIT units alike (both 12.5% under the FY2026-27 pack). */
  equityLtcgRatePct: number;
  /** Flat short-term rate for equity holdings and REIT/InvIT units alike (both 20% under the FY2026-27 pack). */
  equityStcgRatePct: number;
  /** The shared annual exemption on equity-like long-term gains — see the module caveat above. */
  equityLtcgExemptionInr: number;
  /** Long-term rate for "other" holdings (hybrid, gold, international funds) — no annual exemption, no separate short-term rate (short-term gains in this category are slab-taxed). */
  otherLtcgRatePct: number;
  /** Cess added on top of the flat LTCG/STCG rates above. The slab rate is assumed to already include cess, per this project's existing convention (see `sip-swp-simulator.ts`'s module doc comment). */
  capitalGainsCessPct: number;
  /** Household inflation assumption, % a year. */
  inflationPct: number;
}

const STORAGE_KEY = 'fincalc-graphite-tax-settings';

function defaultSharedTaxSettings(): SharedTaxSettings {
  const rules = getCapitalGainsRules('2026-27');
  return {
    slabRatePct: 31.2,
    equityLtcgRatePct: rules.equity.ltcgRate * 100,
    equityStcgRatePct: rules.equity.stcgRate * 100,
    equityLtcgExemptionInr: rules.equity.ltcgExemptionPerYear,
    otherLtcgRatePct: rules.otherAssets.ltcgRate * 100,
    capitalGainsCessPct: 4,
    inflationPct: 6,
  };
}

function readStoredSettings(): Partial<SharedTaxSettings> | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Partial<SharedTaxSettings>) : null;
  } catch {
    return null;
  }
}

function writeStoredSettings(settings: SharedTaxSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // best-effort — a private/locked-down browser just won't persist the choice
  }
}

/**
 * Resolves the shared tax/inflation settings (seeded from the sourced data
 * pack, overridden by whatever the user last edited on either Graphite
 * module) and exposes a patch-style updater — matching the mutation style
 * both modules' own form state already uses (`setForm((f) => ({...f, ...patch}))`).
 * Read fresh on every mount, the same reasoning as `useGraphiteTheme`: the
 * REIT and SIP & SWP routes are separate lazy-loaded, fully-unmounted
 * components, so "settings persist across modules" means localStorage, not
 * surviving in-memory React state.
 */
export function useSharedTaxSettings(): {
  settings: SharedTaxSettings;
  updateSettings: (patch: Partial<SharedTaxSettings>) => void;
  resetSettings: () => void;
} {
  const [settings, setSettings] = useState<SharedTaxSettings>(() => ({
    ...defaultSharedTaxSettings(),
    ...readStoredSettings(),
  }));

  function updateSettings(patch: Partial<SharedTaxSettings>) {
    setSettings((s) => {
      const next = { ...s, ...patch };
      writeStoredSettings(next);
      return next;
    });
  }

  function resetSettings() {
    const next = defaultSharedTaxSettings();
    setSettings(next);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // best-effort, same as writeStoredSettings above
    }
  }

  return { settings, updateSettings, resetSettings };
}
