# Rule packs

One JSON file per rule family per financial year, e.g. `income-tax.fy-2026-27.json`,
`stamp-duty.telangana.fy-2026-27.json`. Every pack carries the envelope defined in
`../src/schema.ts`: an id, the FY, the date it takes effect, and provenance (source URL +
the date the figures were verified against that source).

Rules for editing:

- Never type a rate from memory. Open the official source, copy the figure, record the URL and today's date in `verifiedOn`.
- A new Budget is a data edit here, never a code change in the engine.
- Keep superseded packs; the engine picks by FY so old scenarios stay reproducible.
