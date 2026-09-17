import { useState, type FormEvent } from 'react';

import { formatINR } from '@fincalc/ui';

import { buildMonthlyCashflowCsv, downloadTextFile } from '../lib/csv-export';
import { buildShareUrl } from '../lib/scenario-url';
import type { SavedScenario } from '../lib/saved-scenarios';
import type { LayerOneInputs, LayerOneResult } from '../lib/scenario-builder';

/**
 * Phase 8 (brief §4 "Sharing and persistence"): the "Saved scenarios"
 * list shown above the Layer-1 form (loading one replaces the form's
 * inputs and re-runs the comparison) and, separately, the "Save and
 * share" toolbar shown with a result (save the current inputs, copy a
 * shareable link, export the monthly cash-flow CSV, print/save-as-PDF).
 * Split into two components in one file since they're two views onto the
 * same small feature rather than two independent ones.
 */
export function SavedScenariosPanel({
  scenarios,
  onLoad,
  onDelete,
}: {
  scenarios: SavedScenario[];
  onLoad: (inputs: LayerOneInputs) => void;
  onDelete: (id: string) => void;
}) {
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  if (scenarios.length === 0) return null;

  return (
    <div className="saved-scenarios-panel mt-8 max-w-sm rounded-sm border border-hairline px-4 py-4">
      <p className="text-sm text-ink">Saved scenarios</p>
      <ul className="mt-3 flex flex-col gap-3">
        {scenarios.map((s) => (
          <li key={s.id} className="flex items-start justify-between gap-3 text-sm">
            <div>
              <p className="text-ink">{s.name}</p>
              <p className="text-xs text-ink-muted">
                {formatINR(s.inputs.monthlyHouseholdIncomeNet, { compact: true })} income &middot;{' '}
                {formatINR(s.inputs.monthlyHousingBudget ?? 0, { compact: true })} housing &middot; {s.inputs.horizonYears}yr
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              {confirmingId === s.id ? (
                <>
                  <span className="text-xs text-ink-muted">Delete?</span>
                  <button
                    type="button"
                    onClick={() => {
                      onDelete(s.id);
                      setConfirmingId(null);
                    }}
                    className="text-xs text-rust hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rust"
                  >
                    Yes
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingId(null)}
                    className="text-xs text-ink-muted hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rust"
                  >
                    No
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => onLoad(s.inputs)}
                    className="text-xs text-ink-muted hover:text-rust focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rust"
                  >
                    Load
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingId(s.id)}
                    className="text-xs text-ink-muted hover:text-rust focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rust"
                  >
                    Delete
                  </button>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ScenarioActions({
  layerOne,
  layerOneInputs,
  onSave,
}: {
  layerOne: LayerOneResult;
  layerOneInputs: LayerOneInputs;
  onSave: (name: string) => SavedScenario | null;
}) {
  const [name, setName] = useState('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const [linkStatus, setLinkStatus] = useState<'idle' | 'copied' | 'manual'>('idle');
  const [shareUrl, setShareUrl] = useState('');

  function handleSave(e: FormEvent) {
    e.preventDefault();
    const saved = onSave(name);
    if (saved) {
      setSaveStatus('saved');
      setName('');
      setTimeout(() => setSaveStatus('idle'), 2500);
    } else {
      setSaveStatus('error');
    }
  }

  async function handleCopyLink() {
    const url = buildShareUrl(layerOneInputs, window.location.href);
    setShareUrl(url);
    try {
      await navigator.clipboard.writeText(url);
      setLinkStatus('copied');
      setTimeout(() => setLinkStatus('idle'), 2500);
    } catch {
      // Clipboard API unavailable or denied — fall back to a visible, selectable field rather than failing silently.
      setLinkStatus('manual');
    }
  }

  function handleExportCsv() {
    const csv = buildMonthlyCashflowCsv(layerOne);
    const stamp = new Date().toISOString().slice(0, 10);
    downloadTextFile(`fincalc-cashflow-${stamp}.csv`, csv, 'text/csv;charset=utf-8;');
  }

  return (
    <div className="scenario-tools rounded-sm border border-hairline px-4 py-4">
      <p className="text-sm text-ink">Save and share this scenario</p>

      <form onSubmit={handleSave} className="mt-3 flex max-w-sm flex-wrap items-center gap-2">
        <input
          type="text"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (saveStatus !== 'idle') setSaveStatus('idle');
          }}
          placeholder="Name this scenario"
          className="min-w-0 flex-1 rounded-sm border border-hairline bg-paper px-3 py-2 text-sm text-ink"
        />
        <button
          type="submit"
          disabled={name.trim().length === 0}
          className="shrink-0 rounded-sm border border-rust px-3 py-2 text-sm text-rust hover:bg-rust hover:text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rust disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-rust"
        >
          Save
        </button>
      </form>
      {saveStatus === 'saved' && <p className="mt-1.5 text-xs text-moss">Saved ✓</p>}
      {saveStatus === 'error' && (
        <p className="mt-1.5 text-xs text-ochre">Couldn&rsquo;t save — this browser isn&rsquo;t letting the page store data.</p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={() => void handleCopyLink()}
          className="text-sm text-ink-muted hover:text-rust focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rust"
        >
          Copy shareable link
        </button>
        <button
          type="button"
          onClick={handleExportCsv}
          className="text-sm text-ink-muted hover:text-rust focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rust"
        >
          Export monthly cash flow (CSV)
        </button>
        <button
          type="button"
          onClick={() => window.print()}
          className="text-sm text-ink-muted hover:text-rust focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rust"
        >
          Print / save as PDF
        </button>
      </div>

      {linkStatus === 'copied' && <p className="mt-1.5 text-xs text-moss">Link copied ✓</p>}
      {linkStatus === 'manual' && (
        <input
          type="text"
          readOnly
          value={shareUrl}
          onFocus={(e) => e.currentTarget.select()}
          className="mt-2 w-full max-w-md rounded-sm border border-hairline bg-paper px-3 py-2 font-mono text-xs text-ink"
        />
      )}
    </div>
  );
}
