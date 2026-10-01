import type { SipSwpHoldingType, SipSwpScenario, SipSwpSellFrom, SipSwpWithdrawalMode } from '@fincalc/engine';

/**
 * Illustrative, non-cited defaults for the SIP & SWP planner — the five
 * example holdings, four allocation presets and their weights, and the
 * fixed-deposit comparison rate — ported verbatim from the prototype's own
 * `HOLD`/`PRESETS`/`DEFAULTS.fd` objects (sip-swp-planner.html). Same tier
 * as `monte-carlo-assumptions.ts`'s volatility figures and
 * `scenario-builder.ts`'s `HOME_LOAN_RATE`: a documented starting point the
 * user is expected to edit (every holding's return, expense ratio and
 * allocation is a live form field), not sourced market data. Lives in
 * `apps/web/src/lib`, not `packages/data`, for the same reason those two
 * do — illustrative UI defaults aren't a cited rule pack.
 *
 * The bear/base/bull return adjustments themselves (`SCENARIO_ADJUSTMENTS`)
 * are a real, exported engine constant (`sip-swp-simulator.ts`) rather than
 * duplicated here, since the UI needs the exact figures the engine actually
 * uses, not a second copy that could drift.
 */

export interface SipSwpDefaultHolding {
  key: string;
  name: string;
  type: SipSwpHoldingType;
  returnPct: number;
  expenseRatioPct: number;
}

/** The five example holdings every allocation preset below weights — a Nifty 50 index fund, a flexi-cap fund, a mid-cap fund, a short-duration debt fund and a gold ETF. */
export const DEFAULT_HOLDINGS: readonly SipSwpDefaultHolding[] = [
  { key: 'nifty', name: 'Nifty 50 index fund', type: 'equity', returnPct: 10.5, expenseRatioPct: 0.2 },
  { key: 'flexi', name: 'Flexi-cap fund', type: 'equity', returnPct: 11, expenseRatioPct: 0.75 },
  { key: 'mid', name: 'Mid-cap fund', type: 'equity', returnPct: 12, expenseRatioPct: 0.85 },
  { key: 'debt', name: 'Short-duration debt fund', type: 'debt', returnPct: 6.75, expenseRatioPct: 0.35 },
  { key: 'gold', name: 'Gold ETF', type: 'other', returnPct: 7, expenseRatioPct: 0.5 },
];

export type SipSwpAllocationPresetId = 'index' | 'aggr' | 'bal' | 'cons' | 'custom';

/** Per-holding-key weight (%) and a one-line description, for each of the four selectable presets — `custom` has no weights of its own, it's whatever the user has dragged the table to. */
export const ALLOCATION_PRESETS: Record<Exclude<SipSwpAllocationPresetId, 'custom'>, { label: string; message: string; weightByKey: Record<string, number> }> = {
  index: {
    label: 'Index only',
    message: 'Everything in one low-cost index fund.',
    weightByKey: { nifty: 100, flexi: 0, mid: 0, debt: 0, gold: 0 },
  },
  aggr: {
    label: '80/20',
    message: '80% equity, 20% debt. Suits a long build-up period.',
    weightByKey: { nifty: 40, flexi: 25, mid: 15, debt: 20, gold: 0 },
  },
  bal: {
    label: '60/40',
    message: '60% equity, 40% debt and gold.',
    weightByKey: { nifty: 30, flexi: 20, mid: 10, debt: 35, gold: 5 },
  },
  cons: {
    label: '30/70',
    message: '30% equity, 70% debt and gold. Steadier, lower growth.',
    weightByKey: { nifty: 20, flexi: 10, mid: 0, debt: 60, gold: 10 },
  },
};

/** Default fixed-deposit rate used for the "what an FD would pay instead" comparison stat — illustrative, user-editable, not sourced from any bank. */
export const DEFAULT_FD_RATE_PCT = 6.5;

/** Every other non-tax, non-holdings form default — ported verbatim from the prototype's `DEFAULTS` object. */
export const SIP_SWP_FORM_DEFAULTS = {
  lumpsumInr: 500_000,
  monthlySipInr: 50_000,
  sipStepUpPctPerYear: 5,
  sipWindowYears: 20,
  withdrawalStartYear: 21,
  horizonYears: 40,
  withdrawalMode: 'fixed' as SipSwpWithdrawalMode,
  fixedMonthlyWithdrawalInr: 75_000,
  tieFixedWithdrawalToInflation: true,
  fixedWithdrawalGrowthPctPerYear: 6,
  withdrawalRatePctOfCorpus: 4,
  spreadOverYears: 10,
  sellFrom: 'proportional' as SipSwpSellFrom,
  glide: true,
  glideYears: 5,
  targetEquitySharePct: 40,
  rebalanceAnnually: false,
  scenario: 'base' as SipSwpScenario,
  allocationPreset: 'aggr' as SipSwpAllocationPresetId,
};
