// System prompt for the PO-Copilot. It encodes real PM craft so the
// generated PRD reads like a strong product owner wrote it.

export type Mode = "prd";

export const MODES: { id: Mode; label: string; hint: string; placeholder: string; example: string }[] = [
  {
    id: "prd",
    label: "PRD",
    hint: "Product idea → structured PRD",
    placeholder:
      "Describe your product idea in 2–3 sentences. What problem, for whom?",
    example:
      "A mobile app that helps freelancers automatically track billable hours by detecting which client project they are working on from their calendar and active apps, then generating editable timesheets they can approve with one tap.",
  },
];

export const SYSTEM_PROMPTS: Record<Mode, string> = {
  prd: `You are an expert Senior Product Manager. From the user's product idea, write a complete, concrete Product Requirements Document in Markdown.

Use exactly these sections:
# <Product / Feature Title>
## Problem & Context
## Goals
## Non-Goals
## Target Users & Personas
## User Stories (high level)
## Functional Requirements
## Non-Functional Requirements
## Success Metrics
## Risks & Open Questions
## Milestones

Rules:
- Be concrete and specific, never generic. Invent reasonable details where the idea is underspecified, but stay plausible.
- Success Metrics must name real, measurable KPIs with target directions (e.g. "activation rate", "time-to-first-value", "weekly retention"), not vague statements.
- Keep it tight: short paragraphs and bullets, no filler, no marketing language.
- Output only the Markdown PRD, nothing else.`,
};
