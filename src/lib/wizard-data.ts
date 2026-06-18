// Static content for the PRD wizard flow: the scripted questions, their
// option chips, and the example idea chips shown on the first step.

export type FlowOption = readonly [label: string, description: string];

export type FlowStepId =
  | "idea"
  | "audience"
  | "problem"
  | "requirements"
  | "scope"
  | "metrics"
  | "risks";

export type FlowSection =
  | "goal"
  | "audience"
  | "requirements"
  | "outOfScope"
  | "metrics"
  | "risks";

export type FlowStep = {
  id: FlowStepId;
  section: FlowSection;
  say?: string;
  options?: readonly FlowOption[];
};

export const FLOW: readonly FlowStep[] = [
  { id: "idea", section: "goal" },
  {
    id: "audience",
    section: "audience",
    say: "Great starting point. First — who is this primarily for? Select everyone who applies, or add your own.",
    options: [
      ["Internal teams", "Employees who use this inside their daily workflow."],
      ["SMB customers", "Small & mid-size businesses self-serving, no dedicated CSM."],
      ["Enterprise customers", "Large orgs needing SSO, admin controls, security review."],
      ["Developers", "Engineers integrating via API or SDK."],
      ["Operations & support", "Agents handling high case volume."],
    ],
  },
  {
    id: "problem",
    section: "goal",
    say: "Got it. Now the pain — what makes the current way painful? Pick the angles that ring true.",
    options: [
      ["Manual, repetitive work", "People copy-paste or redo the same steps daily."],
      ["Slow turnaround", "Tasks sit in queues; cycle times are long."],
      ["Errors & inconsistency", "Quality varies by person; mistakes slip through."],
      ["No visibility", "Hard to see status or what changed."],
      ["Fragmented tools", "Work is scattered across disconnected systems."],
      ["Too costly to run", "The current process is expensive to scale."],
    ],
  },
  {
    id: "requirements",
    section: "requirements",
    say: "Clear. Which capabilities are must-haves for v1? Be ruthless — everything here ships first.",
    options: [
      ["AI-generated drafts", "System proposes a draft the user can accept, edit, or reject."],
      ["Review & approve", "Changes require explicit approval before taking effect."],
      ["Templates & presets", "Reusable, savable starting points."],
      ["Integrations", "Connects to the tools the team already uses."],
      ["Roles & permissions", "Access scoped by role."],
      ["Audit log", "Full history of who changed what, and when."],
      ["Analytics dashboard", "A live view of the metrics that matter."],
    ],
  },
  {
    id: "scope",
    section: "outOfScope",
    say: "Noted. Just as important — what are we explicitly NOT doing in v1?",
    options: [
      ["Mobile app", "Native iOS/Android — web only for v1."],
      ["Multi-language", "Localization beyond English."],
      ["Offline mode", "Working without a connection."],
      ["Custom model training", "Fine-tuning on customer data."],
      ["White-label theming", "Reseller / partner branding."],
      ["Public API", "An open external API surface."],
    ],
  },
  {
    id: "metrics",
    section: "metrics",
    say: "Almost there. How will we know v1 is actually working?",
    options: [
      ["Adoption", "Weekly active users / teams onboarded."],
      ["Time saved", "Minutes saved per task vs. today."],
      ["Error reduction", "Fewer reworks and corrections."],
      ["Satisfaction (CSAT)", "User-reported satisfaction score."],
      ["Revenue / conversion", "Impact on paid conversion or expansion."],
      ["Time-to-value", "How fast a new user reaches first value."],
    ],
  },
  {
    id: "risks",
    section: "risks",
    say: "Last one — any risks or dependencies we should call out now?",
    options: [
      ["Model accuracy", "Hallucinations or low-quality output erode trust."],
      ["Data privacy", "Handling sensitive or regulated data."],
      ["Third-party dependency", "Reliance on an external API or vendor."],
      ["Adoption / change mgmt", "Users may resist a new workflow."],
      ["Latency", "Responses must stay fast at scale."],
      ["Cost at scale", "Inference or infra cost grows with usage."],
    ],
  },
] as const;

export const EXAMPLES: readonly string[] = [
  "An AI assistant that drafts support ticket replies",
  "A self-serve analytics dashboard for SMB admins",
  "A one-tap mobile checkout flow",
];

export const FINAL_SAY =
  "That's everything I need. I've finalized the document on the right. Review it, then copy or export when you're happy.";

export type SectionStatus = "empty" | "filling" | "done";
export type ParaSection = { status: SectionStatus; text: string };
export type ListSection = { status: SectionStatus; items: string[] };

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

export type ChatMessage =
  | { role: "agent"; kind: "text"; text: string }
  | { role: "user"; kind: "text"; text: string }
  | { role: "user"; kind: "choices"; chips: string[]; note: string };

export type Answer = { labels: string[]; free: string };

export function emptyPrd(): Prd {
  return {
    title: "",
    goal: { status: "empty", text: "" },
    audience: { status: "empty", items: [] },
    requirements: { status: "empty", items: [] },
    acceptance: { status: "empty", items: [] },
    outOfScope: { status: "empty", items: [] },
    metrics: { status: "empty", items: [] },
    risks: { status: "empty", items: [] },
  };
}

export const SECTION_ORDER = [
  { key: "goal", title: "Goal & Problem", kind: "para" },
  { key: "audience", title: "Target Audience", kind: "list" },
  { key: "requirements", title: "Functional Requirements", kind: "list" },
  { key: "acceptance", title: "Acceptance Criteria", kind: "list" },
  { key: "outOfScope", title: "Out of Scope", kind: "list" },
  { key: "metrics", title: "Success Metrics", kind: "list" },
  { key: "risks", title: "Risks & Dependencies", kind: "list" },
] as const satisfies readonly { key: keyof Omit<Prd, "title">; title: string; kind: "para" | "list" }[];
