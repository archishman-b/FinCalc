import { useMemo, useState } from 'react';

import { getCapitalGainsRules, getCostInflationIndexRules } from '@fincalc/data';
import {
  computePropertyGains,
  debtFundGainsTax,
  equityGainsTax,
  reitGainsTax,
  section54Exemption,
  type GainTaxResult,
  type PropertyLtcgResolution,
} from '@fincalc/engine';

import { Amount } from '../../components/Amount';
import { CalcShell, Callout, NumberField, SelectField, SubmitButton } from '../../components/CalcShell';
import { BreakdownBarChart } from '../../components/charts';
import { usePalette } from '../../lib/theme';

type AssetType = 'equity' | 'reit' | 'debt_fund' | 'property';

const ASSET_OPTIONS: { value: AssetType; label: string }[] = [
  { value: 'equity', label: 'Equity shares / equity mutual funds' },
  { value: 'reit', label: 'Listed REIT / InvIT units' },
  { value: 'debt_fund', label: 'Debt mutual fund' },
  { value: 'property', label: 'Property (real estate)' },
];
const FY_OPTIONS = [
  { value: '2026-27', label: 'FY 2026-27' },
  { value: '2025-26', label: 'FY 2025-26' },
];

function isFlat(r: GainTaxResult | PropertyLtcgResolution): r is Extract<GainTaxResult, { kind: 'flat' }> {
  return 'kind' in r && r.kind === 'flat';
}

/**
 * Tier 1 module 7 (brief §3): equity LTCG/STCG, debt-fund gains, and
 * property gains under the post-23-July-2024 regime choice with Section
 * 54 reinvestment — read straight off the Phase 2 capital-gains engine,
 * the same functions the Comparator's exit economics use (Phase 4), just
 * exercised directly on a single sale rather than inside a Position.
 *
 * Phase 9.1: a breakdown chart accompanies every result shape — gain /
 * tax / net for the two flat-rate cases, pre-exemption gain / Section 54
 * exemption / taxable gain / tax for property, and the bare taxable
 * amount for the one case (debt fund taxed at slab rate) where this
 * calculator doesn't itself compute a tax figure.
 */
export function CapitalGainsCalculator() {
  const [assetType, setAssetType] = useState<AssetType>('equity');
  const [fy, setFy] = useState('2026-27');
  const [gain, setGain] = useState(500_000);
  const [holdingMonths, setHoldingMonths] = useState(24);
  const [acquiredAfterSlabDate, setAcquiredAfterSlabDate] = useState(true);

  const [saleValue, setSaleValue] = useState(9_000_000);
  const [costOfAcquisition, setCostOfAcquisition] = useState(4_000_000);
  const [acquisitionFy, setAcquisitionFy] = useState('2016-17');
  const [reinvestedAmount, setReinvestedAmount] = useState(0);

  const [submitted, setSubmitted] = useState(false);

  // acquisitionFy is free-typed text (a financial year like "2016-17" has no
  // native HTML validation to lean on the way a number input's min/max
  // does elsewhere in this app) — lookupCII throws RangeError for anything
  // outside the shipped Cost Inflation Index table, so this is wrapped in
  // the same discriminated-union pattern Comparator.tsx/RentVsBuy.tsx use,
  // rather than letting a mistyped year crash the page.
  const outcome = useMemo<{ ok: true; value: GainTaxResult | PropertyLtcgResolution } | { ok: false; error: string } | null>(() => {
    if (!submitted) return null;
    try {
      const rules = getCapitalGainsRules(fy);

      if (assetType === 'equity') return { ok: true, value: equityGainsTax({ gain, holdingMonths }, rules.equity) };
      if (assetType === 'reit') return { ok: true, value: reitGainsTax({ gain, holdingMonths }, rules.reit) };
      if (assetType === 'debt_fund') {
        return {
          ok: true,
          value: debtFundGainsTax({ gain, holdingMonths, acquiredOnOrAfterSlabTaxationDate: acquiredAfterSlabDate }, rules.debtFunds),
        };
      }

      const cii = getCostInflationIndexRules();
      const value = computePropertyGains(
        { saleValue, costOfAcquisition, acquisitionFy, saleFy: fy, holdingMonths, taxpayerType: 'resident_individual' },
        rules.property,
        cii,
        reinvestedAmount > 0 ? (g) => section54Exemption(g, reinvestedAmount, rules.section54) : undefined,
      );
      return { ok: true, value };
    } catch (e) {
      const message =
        e instanceof Error
          ? e.message
          : "Something about these numbers didn't compute. Try different values.";
      return { ok: false, error: message };
    }
  }, [submitted, assetType, fy, gain, holdingMonths, acquiredAfterSlabDate, saleValue, costOfAcquisition, acquisitionFy, reinvestedAmount]);

  const result = outcome?.ok ? outcome.value : null;
  const error = outcome && !outcome.ok ? outcome.error : null;

  return (
    <CalcShell
      title="Capital gains"
      subtitle="Equity, REIT, debt-fund and property gains under current law — including the post-23-July-2024 property regime choice and Section 54 reinvestment."
      form={
        <form
          className="flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            setSubmitted(true);
          }}
        >
          <SelectField label="Asset type" value={assetType} onChange={setAssetType} options={ASSET_OPTIONS} />
          <SelectField label="Financial year of sale" value={fy} onChange={setFy} options={FY_OPTIONS} />

          {assetType !== 'property' ? (
            <>
              <NumberField label="Gain (sale price − cost)" value={gain} onChange={setGain} step={10000} />
              <NumberField label="Holding period, months" value={holdingMonths} onChange={setHoldingMonths} step={1} min={0} />
              {assetType === 'debt_fund' && (
                <label className="flex items-center gap-2 text-sm text-ink">
                  <input type="checkbox" checked={acquiredAfterSlabDate} onChange={(e) => setAcquiredAfterSlabDate(e.target.checked)} className="accent-rust" />
                  Acquired on/after the Finance Act 2023 slab-taxation cutoff
                </label>
              )}
            </>
          ) : (
            <>
              <NumberField label="Sale value" value={saleValue} onChange={setSaleValue} step={100000} />
              <NumberField label="Cost of acquisition" value={costOfAcquisition} onChange={setCostOfAcquisition} step={100000} />
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="text-ink">Financial year of acquisition</span>
                <input
                  type="text"
                  value={acquisitionFy}
                  onChange={(e) => setAcquisitionFy(e.target.value)}
                  placeholder="e.g. 2016-17"
                  className="rounded-sm border border-hairline bg-paper px-3 py-2 font-mono tabular-nums text-ink"
                />
              </label>
              <NumberField label="Holding period, months" value={holdingMonths} onChange={setHoldingMonths} step={1} min={0} />
              <NumberField label="Section 54 reinvestment amount (optional)" value={reinvestedAmount} onChange={setReinvestedAmount} step={100000} required={false} />
            </>
          )}
          <SubmitButton>Calculate →</SubmitButton>
        </form>
      }
    >
      {error && <Callout>{error}</Callout>}

      {result && <CapitalGainsResult result={result} />}
    </CalcShell>
  );
}

function CapitalGainsResult({ result }: { result: GainTaxResult | PropertyLtcgResolution }) {
  const palette = usePalette();

  const chartData =
    'chosenRoute' in result
      ? [
          { label: 'Pre-exemption gain', value: result.preExemption.taxableAmount, color: palette.ink },
          { label: 'Section 54 exemption', value: result.exemptionApplied, color: palette.moss },
          { label: 'Taxable gain', value: result.result.taxableAmount, color: palette.ochre },
          { label: 'Tax', value: result.result.tax, color: palette.rust },
        ]
      : isFlat(result)
        ? [
            { label: 'Taxable gain', value: result.taxableAmount, color: palette.ink },
            { label: 'Tax', value: result.tax, color: palette.rust },
            { label: 'Net after tax', value: result.taxableAmount - result.tax, color: palette.moss },
          ]
        : [{ label: 'Taxable amount (added to income)', value: result.amount, color: palette.ink }];

  return (
    <section className="flex flex-col gap-8" aria-label="Capital gains result">
      {'kind' in result ? (
        <div>
          <p className="text-sm text-ink-muted">{result.kind === 'flat' ? `Tax at ${(result.rate * 100).toFixed(1)}%` : 'Taxed at slab rate — add to other income'}</p>
          <Amount value={isFlat(result) ? result.tax : result.amount} compact={false} className="font-serif-heading text-4xl text-rust" />
          {isFlat(result) && <p className="mt-1 text-sm text-ink-muted">on <Amount value={result.taxableAmount} className="text-ink" /> taxable gain</p>}
        </div>
      ) : (
        <div>
          <p className="text-sm text-ink-muted">
            Chosen route: {result.chosenRoute === 'withIndexation' ? '20% with indexation' : '12.5% without indexation'}
          </p>
          <Amount value={result.result.tax} compact={false} className="font-serif-heading text-4xl text-rust" />
          <dl className="mt-4 grid max-w-md grid-cols-2 gap-y-2 text-sm">
            <dt className="text-ink-muted">Pre-exemption gain</dt>
            <dd className="text-right"><Amount value={result.preExemption.taxableAmount} className="text-ink" /></dd>
            <dt className="text-ink-muted">Section 54 exemption applied</dt>
            <dd className="text-right"><Amount value={result.exemptionApplied} className="text-moss" /></dd>
            <dt className="text-ink-muted">Taxable gain after exemption</dt>
            <dd className="text-right"><Amount value={result.result.taxableAmount} className="text-ink" /></dd>
          </dl>
        </div>
      )}

      <div>
        <p className="mb-3 text-sm text-ink">Breakdown</p>
        <BreakdownBarChart data={chartData} ariaLabel="Capital gains breakdown: gain, exemption if any, taxable amount, and tax" />
      </div>
    </section>
  );
}
