# Rule packs

One JSON file per rule family per financial year, e.g. `income-tax.fy-2026-27.json`,
`stamp-duty.telangana.fy-2026-27.json`. Every pack carries the envelope defined in
`../src/schema.ts`: an id, the FY, the date it takes effect, and provenance (source URL +
the date the figures were verified against that source).

Rules for editing:

- Never type a rate from memory. Open the official source, copy the figure, record the URL and today's date in `verifiedOn`.
- A new Budget is a data edit here, never a code change in the engine.
- Keep superseded packs; the engine picks by FY so old scenarios stay reproducible.

## Reference packs (a second, separate convention)

`reit-instruments.json` and `reit-distribution-history.json` are not rule
packs — they don't go through `schema.ts`'s `RulePackEnvelope`/`registry`
(they carry no `fy`, and their provenance isn't an `https://` official
source). They're REIT-instrument facts and distribution history supplied
directly by the user, not pulled from a filing — see `reit-reference.ts`'s
module doc comment for the full reasoning and `ReitDataProvenance`'s
`sourceType` for how that's recorded honestly instead of faking a citation.

