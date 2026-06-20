# Consistency Check Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Check for contradictions" action to the finished PRD that detects and visually highlights contradictions between two PRD sections (e.g. Target Audience vs. Out of Scope).

**Architecture:** Reuse the existing `/api/generate` streaming route with a new `wizard-critique` prompt mode. The full PRD (via the existing `buildMarkdownPrd`) is sent as input; Claude returns a small pipe-delimited findings list, parsed by a new pure helper `parseCritique`. The UI stores findings in component state and renders an orange left-border + callout box on any section that has a finding.

**Tech Stack:** Next.js App Router, TypeScript, Vercel AI SDK (`ai`, `@ai-sdk/anthropic`) — all already in use, no new dependencies.

## Global Constraints

- No new API route — the critique call goes through the existing `/api/generate` route and its existing rate limiting.
- No new npm dependencies (project has no test framework installed — see Task 1 for how the self-check runs without one).
- Section keys are exactly: `goal`, `audience`, `requirements`, `acceptance`, `outOfScope`, `metrics`, `risks` (the existing `Prd` keys minus `title`).
- Findings response format is exactly: `- <sectionKeyA> | <sectionKeyB> | <one-sentence explanation>` under a `## Findings` header.
- No persistence/caching of critique results across reloads, and no automatic re-run on edit (PRD sections aren't editable once the wizard is done).

---

### Task 1: `parseCritique` helper + types

**Files:**
- Modify: `src/lib/wizard-data.ts` (add types after the `Prd` type)
- Modify: `src/lib/wizard-helpers.ts` (add `parseCritique`, extend imports)
- Create: `src/lib/wizard-helpers.test.ts`

**Interfaces:**
- Produces: `SectionKey` (type, `src/lib/wizard-data.ts`) — `keyof Omit<Prd, "title">`, i.e. one of `"goal" | "audience" | "requirements" | "acceptance" | "outOfScope" | "metrics" | "risks"`.
- Produces: `Finding` (type, `src/lib/wizard-data.ts`) — `{ a: SectionKey; b: SectionKey; note: string }`.
- Produces: `parseCritique(text: string): Finding[]` (function, `src/lib/wizard-helpers.ts`).

- [ ] **Step 1: Add `SectionKey` and `Finding` types**

In `src/lib/wizard-data.ts`, find this existing block:

```ts
export type Prd = {
  title: string;
  goal: ParaSection;
  audience: ListSection;
  requirements: ListSection;
  acceptance: ListSection;
  outOfScope: ListSection;
  metrics: ListSection;
  risks: ListSection;
};
```

Immediately after it (before `export type ChatMessage =`), add:

```ts
export type SectionKey = keyof Omit<Prd, "title">;

export type Finding = { a: SectionKey; b: SectionKey; note: string };
```

- [ ] **Step 2: Write the failing test**

Create `src/lib/wizard-helpers.test.ts`:

```ts
import assert from "node:assert/strict";
import { parseCritique } from "./wizard-helpers";

// empty input -> no findings
assert.deepStrictEqual(parseCritique(""), []);

// one well-formed line -> one finding
assert.deepStrictEqual(
  parseCritique(
    "## Findings\n- audience | outOfScope | Audience names power users but Out of Scope excludes them.",
  ),
  [{ a: "audience", b: "outOfScope", note: "Audience names power users but Out of Scope excludes them." }],
);

// multiple well-formed lines -> multiple findings, in order
assert.deepStrictEqual(
  parseCritique(
    "## Findings\n- audience | outOfScope | Conflict one.\n- requirements | goal | Conflict two.",
  ),
  [
    { a: "audience", b: "outOfScope", note: "Conflict one." },
    { a: "requirements", b: "goal", note: "Conflict two." },
  ],
);

// line missing the third pipe segment is dropped, not thrown
assert.deepStrictEqual(parseCritique("## Findings\n- audience | outOfScope"), []);

// line with an invalid section key is dropped
assert.deepStrictEqual(
  parseCritique("## Findings\n- audience | notARealSection | Some note."),
  [],
);

console.log("wizard-helpers.test.ts: all assertions passed");
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx tsx src/lib/wizard-helpers.test.ts`
Expected: FAIL — `parseCritique` is not exported from `./wizard-helpers` (module has no exported member `parseCritique`).

(`npx tsx` is a one-off, on-the-fly TypeScript runner — it does not add anything to `package.json`. The project has no test framework installed, so this is the smallest way to run an `assert`-based check against TypeScript source.)

- [ ] **Step 4: Implement `parseCritique`**

In `src/lib/wizard-helpers.ts`, change the top import line from:

```ts
import type { Answer, Prd } from "./wizard-data";
```

to:

```ts
import { SECTION_ORDER } from "./wizard-data";
import type { Answer, Finding, Prd, SectionKey } from "./wizard-data";
```

Then add this function at the end of the file:

```ts
const VALID_SECTION_KEYS = new Set<SectionKey>(SECTION_ORDER.map((s) => s.key));

// Parses the pipe-delimited findings list Claude returns for the
// "wizard-critique" prompt: "## Findings" followed by zero or more
// "- <sectionKeyA> | <sectionKeyB> | <note>" lines. Malformed lines are
// dropped rather than thrown, since an empty findings list and a parse
// failure both mean the same thing to the UI: no contradictions to show.
export function parseCritique(text: string): Finding[] {
  const splitAt = text.search(/##\s*Findings/i);
  const block = splitAt >= 0 ? text.slice(splitAt) : text;
  const findings: Finding[] = [];

  for (const rawLine of block.split("\n")) {
    const line = rawLine.trim();
    if (!line.startsWith("-") && !line.startsWith("*")) continue;

    const parts = line
      .replace(/^[-*]\s*/, "")
      .split("|")
      .map((p) => p.trim());
    if (parts.length !== 3) continue;

    const [a, b, note] = parts;
    if (!a || !b || !note) continue;
    if (!VALID_SECTION_KEYS.has(a as SectionKey) || !VALID_SECTION_KEYS.has(b as SectionKey)) continue;

    findings.push({ a: a as SectionKey, b: b as SectionKey, note });
  }

  return findings;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx tsx src/lib/wizard-helpers.test.ts`
Expected: PASS — prints `wizard-helpers.test.ts: all assertions passed` with no thrown errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/wizard-data.ts src/lib/wizard-helpers.ts src/lib/wizard-helpers.test.ts
git commit -m "Add parseCritique helper for cross-section consistency findings"
```

---

### Task 2: `wizard-critique` prompt + button/state/handler

**Files:**
- Modify: `src/lib/prompts.ts`
- Modify: `src/app/page.tsx`

**Interfaces:**
- Consumes: `parseCritique(text: string): Finding[]` and `Finding` type from Task 1.
- Consumes: `streamGenerate(mode: string, input: string, onChunk?, signal?): Promise<string>` (existing, `src/lib/wizard-helpers.ts`).
- Consumes: `buildMarkdownPrd(prd: Prd): string` (existing, `src/lib/wizard-helpers.ts`).
- Produces: `critique` state (`{ status: "idle" | "checking" | "done"; findings: Finding[] }`) in `page.tsx`, read by Task 3.

- [ ] **Step 1: Add the `wizard-critique` prompt mode**

In `src/lib/prompts.ts`, change:

```ts
export type Mode = "wizard-goal" | "wizard-requirements";
```

to:

```ts
export type Mode = "wizard-goal" | "wizard-requirements" | "wizard-critique";
```

Then add a new entry to `SYSTEM_PROMPTS` (after `"wizard-requirements"`, keeping the trailing comma on that entry):

```ts
  "wizard-critique": `You are an expert Senior Product Manager reviewing a finished PRD for internal consistency. You will be given the full PRD in Markdown, with sections: Goal & Problem, Target Audience, Functional Requirements, Acceptance Criteria, Out of Scope, Success Metrics, and Risks & Dependencies.

Find only direct contradictions BETWEEN two sections — for example the audience section names a group as primary while the out-of-scope section excludes them, or a requirement has no connection to the stated goal/problem. Do not flag vague wording, missing edge cases, or anything within a single section alone.

Respond with exactly this format and nothing else:

## Findings
- <sectionKeyA> | <sectionKeyB> | <one-sentence explanation>

Each <sectionKeyA> and <sectionKeyB> must be exactly one of: goal, audience, requirements, acceptance, outOfScope, metrics, risks. One bullet per contradiction found. If there are no contradictions, output "## Findings" with no bullets beneath it. No preamble, no other text, no markdown formatting beyond the bullets shown.`,
```

- [ ] **Step 2: Add `critique` state and reset it in `reset()`**

In `src/app/page.tsx`, update the import from `wizard-data` to include `Finding`:

```ts
import {
  FLOW,
  EXAMPLES,
  FINAL_SAY,
  SECTION_ORDER,
  emptyPrd,
  type Answer,
  type ChatMessage,
  type Finding,
  type FlowStepId,
  type Prd,
} from "@/lib/wizard-data";
```

Update the import from `wizard-helpers` to include `parseCritique`:

```ts
import {
  buildMarkdownPrd,
  fallbackAcceptance,
  fallbackGoalText,
  joinNice,
  listFrom,
  parseCritique,
  parseHeadedLists,
  streamGenerate,
  toTitle,
} from "@/lib/wizard-helpers";
```

Add a new state declaration next to the existing `prd` state:

```ts
  const [prd, setPrd] = useState<Prd>(emptyPrd());
  const [critique, setCritique] = useState<{ status: "idle" | "checking" | "done"; findings: Finding[] }>({
    status: "idle",
    findings: [],
  });
```

In `reset()`, add a line resetting critique state alongside the existing `setPrd(emptyPrd());`:

```ts
    setPrd(emptyPrd());
    setCritique({ status: "idle", findings: [] });
```

- [ ] **Step 3: Add the `checkConsistency` handler**

Add this function near `copyMd`/`exportMd` (after `exportMd`, before `const showPrd = ...`):

```ts
  async function checkConsistency() {
    if (critique.status === "checking") return;
    setCritique({ status: "checking", findings: [] });
    try {
      const text = await streamGenerate("wizard-critique", buildMarkdownPrd(prd));
      const findings = parseCritique(text);
      setCritique({ status: "done", findings });
      if (findings.length === 0) showToast("No contradictions found");
    } catch {
      setCritique({ status: "idle", findings: [] });
      showToast("Couldn't reach Claude — try again in a moment.");
    }
  }
```

- [ ] **Step 4: Add the button**

In the `done` block, find:

```tsx
                  <div style={{ display: "flex", gap: 9, flexWrap: "wrap" }}>
                    <button onClick={copyMd} className="po-btn-primary" style={ghostButtonBase(true)}>
                      Copy Markdown
                    </button>
                    <button onClick={exportMd} className="po-btn-ghost" style={ghostButtonBase(false)}>
                      Download .md
                    </button>
                    <button onClick={reset} className="po-btn-ghost" style={ghostButtonBase(false)}>
                      Start over
                    </button>
                  </div>
```

Replace it with:

```tsx
                  <div style={{ display: "flex", gap: 9, flexWrap: "wrap" }}>
                    <button onClick={copyMd} className="po-btn-primary" style={ghostButtonBase(true)}>
                      Copy Markdown
                    </button>
                    <button onClick={exportMd} className="po-btn-ghost" style={ghostButtonBase(false)}>
                      Download .md
                    </button>
                    <button
                      onClick={checkConsistency}
                      disabled={critique.status === "checking"}
                      className="po-btn-ghost"
                      style={ghostButtonBase(false)}
                    >
                      {critique.status === "checking" ? "Checking…" : "Check for contradictions"}
                    </button>
                    <button onClick={reset} className="po-btn-ghost" style={ghostButtonBase(false)}>
                      Start over
                    </button>
                  </div>
```

- [ ] **Step 5: Manually verify**

Run: `npm run dev`
Open `http://localhost:3000`, type an idea (e.g. one of the example chips), answer all wizard steps to reach the finished PRD, then click **Check for contradictions**.

Expected:
- Button reads "Checking…" and is disabled while the request is in flight.
- Button returns to "Check for contradictions" and is enabled again afterward.
- If Claude reports no contradictions, a toast reading "No contradictions found" appears bottom-of-input-area (existing toast mechanism).
- In the browser Network tab, confirm a `POST /api/generate` request fired with body `{"mode":"wizard-critique","input":"..."}`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/prompts.ts src/app/page.tsx
git commit -m "Add wizard-critique prompt and consistency-check button"
```

---

### Task 3: Inline markup for flagged sections

**Files:**
- Modify: `src/app/page.tsx`

**Interfaces:**
- Consumes: `critique.findings: Finding[]` state from Task 2.
- Consumes: `SECTION_ORDER` (existing, `src/lib/wizard-data.ts`) — used to look up a finding's other-section title.

- [ ] **Step 1: Compute per-section findings and flag state**

In `src/app/page.tsx`, find the section render loop:

```tsx
              {SECTION_ORDER.map((o, i) => {
                const s = prd[o.key];
                return (
                  <div key={o.key} style={{ padding: "18px 0", borderTop: "1px solid rgba(201,165,99,.1)" }}>
```

Replace the start of that block with:

```tsx
              {SECTION_ORDER.map((o, i) => {
                const s = prd[o.key];
                const sectionFindings = critique.findings.filter((f) => f.a === o.key || f.b === o.key);
                const flagged = sectionFindings.length > 0;
                return (
                  <div
                    key={o.key}
                    style={{
                      padding: "18px 0",
                      borderTop: "1px solid rgba(201,165,99,.1)",
                      borderLeft: flagged ? "3px solid #d9883c" : "none",
                      paddingLeft: flagged ? 12 : 0,
                    }}
                  >
```

- [ ] **Step 2: Render the callout boxes**

Find the end of the section's content rendering — the block that ends with the "done" + "list" case:

```tsx
                    {s.status === "done" && o.kind === "list" && (
                      <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 9, animation: "fadeUp .3s ease" }}>
                        {(s as { items: string[] }).items.map((it, ii) => (
                          <li key={ii} style={{ display: "flex", gap: 10, fontSize: 13.5, lineHeight: 1.55, color: "#cdc5b6" }}>
                            <span style={{ color: "#c9a563", flex: "none", marginTop: 1 }}>—</span>
                            <span>{it}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
```

Replace it with:

```tsx
                    {s.status === "done" && o.kind === "list" && (
                      <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 9, animation: "fadeUp .3s ease" }}>
                        {(s as { items: string[] }).items.map((it, ii) => (
                          <li key={ii} style={{ display: "flex", gap: 10, fontSize: 13.5, lineHeight: 1.55, color: "#cdc5b6" }}>
                            <span style={{ color: "#c9a563", flex: "none", marginTop: 1 }}>—</span>
                            <span>{it}</span>
                          </li>
                        ))}
                      </ul>
                    )}

                    {flagged && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 11 }}>
                        {sectionFindings.map((f, fi) => {
                          const otherKey = f.a === o.key ? f.b : f.a;
                          const otherTitle = SECTION_ORDER.find((sec) => sec.key === otherKey)?.title ?? otherKey;
                          return (
                            <div
                              key={fi}
                              style={{
                                fontSize: 12.5,
                                lineHeight: 1.5,
                                color: "#e3b685",
                                background: "rgba(217,136,60,.1)",
                                border: "1px solid rgba(217,136,60,.3)",
                                borderRadius: 8,
                                padding: "8px 11px",
                              }}
                            >
                              ⚠ Conflicts with <strong>{otherTitle}</strong>: {f.note}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
```

- [ ] **Step 3: Manually verify rendering**

Since live model output isn't deterministic, verify the rendering with a hardcoded value first:

In `checkConsistency`, temporarily replace the body with:

```ts
  async function checkConsistency() {
    setCritique({
      status: "done",
      findings: [{ a: "audience", b: "outOfScope", note: "Test conflict for visual verification." }],
    });
  }
```

Run: `npm run dev`, complete the wizard, click **Check for contradictions**.
Expected: both the "Target Audience" and "Out of Scope" sections show an orange left border, and each renders a callout box reading `⚠ Conflicts with <other section title>: Test conflict for visual verification.`

Revert `checkConsistency` to the real implementation from Task 2 Step 3 once confirmed.

- [ ] **Step 4: Manually verify the real end-to-end path**

Run: `npm run dev`, complete the wizard with a deliberately contradictory PRD (e.g. pick "Enterprise customers" as audience, then pick "Public API" as out-of-scope while describing an API-first product idea), click **Check for contradictions**.
Expected: either a real finding renders with the orange markup (if Claude detects the contradiction), or the "No contradictions found" toast appears. Both are valid outcomes — this step confirms the live path renders without errors, not a specific model output.

- [ ] **Step 5: Commit**

```bash
git add src/app/page.tsx
git commit -m "Add inline contradiction markup to flagged PRD sections"
```
