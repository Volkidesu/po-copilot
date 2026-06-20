import { SECTION_ORDER } from "./wizard-data";
import type { Answer, Finding, Prd, SectionKey } from "./wizard-data";

export function listFrom(a?: Answer): string[] {
  if (!a) return [];
  const arr = a.labels ? a.labels.slice() : [];
  if (a.free) arr.push(a.free);
  return arr;
}

export function joinNice(arr: string[]): string {
  if (!arr.length) return "";
  if (arr.length === 1) return arr[0];
  if (arr.length === 2) return `${arr[0]} and ${arr[1]}`;
  return `${arr.slice(0, -1).join(", ")}, and ${arr[arr.length - 1]}`;
}

export function toTitle(idea: string): string {
  let t = idea.trim().replace(/[.]+$/, "");
  if (t.length > 64) t = `${t.slice(0, 64).trim()}…`;
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : "Untitled product";
}

// Used only if the live Claude call for the goal paragraph fails.
export function fallbackGoalText(idea: string, audience: string[], problem: string[]): string {
  let s = idea.trim();
  if (s) {
    s = s.charAt(0).toUpperCase() + s.slice(1);
    if (!/[.!?…]$/.test(s)) s += ".";
  }
  let out = s;
  if (audience.length) out += ` The primary users are ${joinNice(audience)}.`;
  if (problem.length) {
    out += ` Today they struggle with ${joinNice(problem.map((x) => x.toLowerCase()))} — this product is built to remove that friction.`;
  }
  return out;
}

const FALLBACK_ACCEPTANCE = [
  "Each requirement above has a measurable, testable outcome agreed with engineering before build.",
];

export function fallbackAcceptance(): string[] {
  return FALLBACK_ACCEPTANCE;
}

// Parses the two headed bullet lists Claude returns for the
// "wizard-requirements" prompt. Tolerant of partial/streaming text so it can
// be used to render content live as it streams in.
export function parseHeadedLists(text: string): { requirements: string[]; acceptance: string[] } {
  const splitAt = text.search(/##\s*Acceptance Criteria/i);
  const reqBlock = splitAt >= 0 ? text.slice(0, splitAt) : text;
  const accBlock = splitAt >= 0 ? text.slice(splitAt) : "";
  const bullets = (block: string) =>
    block
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.startsWith("-") || l.startsWith("*"))
      .map((l) => l.replace(/^[-*]\s*/, "").trim())
      .filter(Boolean);
  return { requirements: bullets(reqBlock), acceptance: bullets(accBlock) };
}

export function buildMarkdownPrd(prd: Prd): string {
  const lines: string[] = [
    `# ${prd.title || "Product Requirements Document"}`,
    "",
    "_Draft v0.1 · generated with PO Copilot_",
  ];
  const section = (title: string, body: string[] | string) => {
    lines.push("", `## ${title}`);
    if (Array.isArray(body)) {
      if (body.length) body.forEach((b) => lines.push(`- ${b}`));
      else lines.push("—");
    } else {
      lines.push(body || "—");
    }
  };
  section("Goal & Problem", prd.goal.text || "—");
  section("Target Audience", prd.audience.items);
  section("Functional Requirements", prd.requirements.items);
  section("Acceptance Criteria", prd.acceptance.items);
  section("Out of Scope", prd.outOfScope.items);
  section("Success Metrics", prd.metrics.items);
  section("Risks & Dependencies", prd.risks.items);
  return lines.join("\n");
}

// Streams a /api/generate response, invoking onChunk with the accumulated
// text as it arrives, and resolving with the final full text.
export async function streamGenerate(
  mode: string,
  input: string,
  onChunk?: (acc: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const res = await fetch("/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode, input }),
    signal,
  });
  if (!res.ok || !res.body) {
    throw new Error((await res.text().catch(() => "")) || "Generation failed.");
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let acc = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    acc += decoder.decode(value, { stream: true });
    onChunk?.(acc);
  }
  return acc;
}

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
    if (a === b) continue;

    findings.push({ a: a as SectionKey, b: b as SectionKey, note });
  }

  return findings;
}
