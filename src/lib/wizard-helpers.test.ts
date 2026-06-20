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

// "*" bullet character is supported, not just "-"
assert.deepStrictEqual(
  parseCritique("## Findings\n* audience | outOfScope | Some note."),
  [{ a: "audience", b: "outOfScope", note: "Some note." }],
);

// no "## Findings" header at all: search returns -1, so the whole text is
// scanned and a valid-looking bullet line is still parsed (intentional fallback)
assert.deepStrictEqual(
  parseCritique("- audience | outOfScope | Some note."),
  [{ a: "audience", b: "outOfScope", note: "Some note." }],
);

// a finding where a section conflicts with itself is dropped
assert.deepStrictEqual(
  parseCritique("## Findings\n- audience | audience | Some note."),
  [],
);

console.log("wizard-helpers.test.ts: all assertions passed");
