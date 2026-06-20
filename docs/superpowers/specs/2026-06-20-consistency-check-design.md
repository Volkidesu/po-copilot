# Consistency Check — Design Spec

## Problem

The PRD wizard generates a structured document from answers picked across multiple, independent steps. Nothing checks whether those answers actually agree with each other — e.g. the audience step and the out-of-scope step are answered separately and can silently contradict each other (audience names power users as primary, out-of-scope excludes them). PMs reviewing a finished PRD have to spot this manually.

## Goal

Add a "Check for contradictions" action on the finished PRD that finds and highlights contradictions **between sections** of the generated document. Scope is deliberately narrow: cross-section contradictions only — not vague acceptance criteria, missing edge cases, or metric coverage. Those are separate, future checks if ever needed.

## Trigger & Flow

- New button "Check for contradictions" next to "Copy Markdown" / "Download .md", visible only when `done === true`.
- On click: build `buildMarkdownPrd(prd)`, send to a new `wizard-critique` mode on the existing `/api/generate` route (same rate limiting, same streaming plumbing — no new route).
- Button shows a "Checking…" state while the request is in flight. Re-clickable; no caching of previous results.
- PRD sections aren't currently editable in the UI, so there's no invalidation-on-edit concern.

## Prompt & Response Format

New entry in `SYSTEM_PROMPTS` (`src/lib/prompts.ts`), mode `wizard-critique`. System prompt instructs Claude to compare the given PRD's sections and report only direct contradictions between two named sections, in this exact format:

```
## Findings
- <sectionKeyA> | <sectionKeyB> | <one-sentence explanation>
```

One line per finding. `sectionKeyA`/`sectionKeyB` are one of: `audience`, `goal`, `requirements`, `acceptance`, `outOfScope`, `metrics`, `risks`. No findings → omit lines under `## Findings` (or omit the header entirely). No preamble, no other sections, no markdown bullets beyond the format above.

This mirrors the existing `wizard-requirements` headed-list pattern already used in the codebase, so parsing stays simple and streaming-tolerant (no JSON parsing of partial chunks).

## Data Model & Parsing

```ts
type Finding = { a: SectionKey; b: SectionKey; note: string };
```

New helper `parseCritique(text: string): Finding[]` in `src/lib/wizard-helpers.ts`, structurally analogous to `parseHeadedLists`:
- Find the `## Findings` header; take everything after it.
- Per line: trim, must start with `-`/`*`, split on `|` into exactly 3 parts, trim each.
- Drop lines that don't yield exactly 3 non-empty parts (malformed line ≠ crash, just skipped).
- Drop lines where `a`/`b` aren't valid `SectionKey`s.

Unparseable or empty response → empty array, which the UI treats identically to "no contradictions found."

## UI State

New state in `page.tsx`:

```ts
const [critique, setCritique] = useState<{
  status: "idle" | "checking" | "done";
  findings: Finding[];
}>({ status: "idle", findings: [] });
```

- `idle`: button reads "Check for contradictions", enabled.
- `checking`: button disabled, reads "Checking…".
- `done`, `findings.length === 0`: button re-enabled, toast "No contradictions found".
- `done`, `findings.length > 0`: button re-enabled, sections with findings get inline markup (below).

## Inline Markup

In the `SECTION_ORDER.map(...)` render loop, for each section `o.key`:
- Collect findings where `finding.a === o.key || finding.b === o.key`.
- If any: replace the section's plain `borderTop` with a warning-colored `borderLeft` (e.g. `3px solid #d9883c`) to flag it visually without restructuring the layout.
- Directly under the section's existing content, render one callout line per matching finding:
  > ⚠ Conflicts with **{otherSectionTitle}**: {finding.note}

Multiple findings on one section stack as multiple callout lines. No changes to sections that have no findings.

## Error Handling

- Network/rate-limit/missing-API-key failure during the critique call: same pattern as existing Claude calls — show a toast ("Couldn't reach Claude — try again in a moment.") and reset `critique.status` to `"idle"`. No local fallback text is generated (unlike goal/requirements, there's nothing reasonable to guess here).
- Malformed/unparseable response: handled by `parseCritique` returning `[]` — treated as "no contradictions found," no crash, no special-cased error UI.

## Testing

`parseCritique` gets a small `test_*` style check (no framework, ponytail-style):
- Empty input → `[]`.
- One well-formed line → one `Finding`.
- Multiple well-formed lines → multiple `Finding`s in order.
- A line missing the third pipe segment → dropped, doesn't throw.
- A line with an invalid section key → dropped.

This is the one runnable check backing the non-trivial parsing logic; everything else here is either pure rendering (visually verified) or follows patterns already proven elsewhere in the codebase.

## Out of Scope

- Vague/non-testable acceptance criteria detection.
- Missing edge case detection.
- Success-metrics-to-requirement traceability checks.
- Persisting or caching critique results across reloads.
- Re-running critique automatically when answers change (sections aren't editable post-completion today).
