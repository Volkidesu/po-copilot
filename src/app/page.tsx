"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
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
import { ACTIVE_MODEL } from "@/lib/model";

const AGENT_NAME = "Ada";
const THINKING_MS = 650;

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cardStyle(selected: boolean): CSSProperties {
  return {
    display: "flex",
    gap: 10,
    alignItems: "flex-start",
    textAlign: "left",
    width: "100%",
    padding: "11px 12px",
    borderRadius: 10,
    cursor: "pointer",
    fontFamily: "inherit",
    transition: "border-color .15s, background .15s",
    border: `1px solid ${selected ? "rgba(201,165,99,.55)" : "rgba(201,165,99,.14)"}`,
    background: selected ? "rgba(201,165,99,.12)" : "#141210",
  };
}

function boxStyle(selected: boolean): CSSProperties {
  return {
    width: 18,
    height: 18,
    borderRadius: 5,
    flex: "none",
    marginTop: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 11,
    fontWeight: 700,
    border: `1px solid ${selected ? "#c9a563" : "rgba(201,165,99,.3)"}`,
    background: selected ? "#c9a563" : "transparent",
    color: selected ? "#0a0906" : "transparent",
  };
}

function sendStyle(disabled: boolean): CSSProperties {
  return {
    flex: "none",
    border: "none",
    borderRadius: 10,
    padding: "12px 18px",
    fontSize: 13,
    fontWeight: 600,
    fontFamily: "inherit",
    cursor: disabled ? "not-allowed" : "pointer",
    transition: "opacity .15s",
    color: "#0a0906",
    background: "#c9a563",
    opacity: disabled ? 0.4 : 1,
  };
}

function tabStyle(active: boolean): CSSProperties {
  return {
    border: `1px solid ${active ? "rgba(201,165,99,.5)" : "transparent"}`,
    background: active ? "rgba(201,165,99,.14)" : "transparent",
    color: active ? "#ede8dd" : "#7d7566",
    borderRadius: 7,
    padding: "5px 13px",
    fontSize: 12,
    fontWeight: 500,
    fontFamily: "inherit",
    cursor: "pointer",
    transition: "all .15s",
  };
}

export default function Home() {
  const [stepIndex, setStepIndex] = useState(0);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [freeText, setFreeText] = useState("");
  const [agentTyping, setAgentTyping] = useState(false);
  const [done, setDone] = useState(false);
  const [toast, setToast] = useState("");
  const [layout, setLayout] = useState<"split" | "focus">("split");
  const [prd, setPrd] = useState<Prd>(emptyPrd());
  const [critique, setCritique] = useState<{ status: "idle" | "checking" | "done"; findings: Finding[] }>({
    status: "idle",
    findings: [],
  });

  // Internal bookkeeping that never renders directly, so it's safe to keep
  // in refs and read synchronously without waiting on React state batching.
  const ideaRef = useRef("");
  const answersRef = useRef<Partial<Record<FlowStepId, Answer>>>({});
  const abortRef = useRef<AbortController | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const chatRef = useRef<HTMLDivElement>(null);
  const customRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = chatRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, agentTyping]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  function showToast(t: string) {
    setToast(t);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2200);
  }

  function pushAgentMessage(text: string) {
    setMessages((m) => [...m, { role: "agent", kind: "text", text }]);
  }

  function toggleOption(label: string) {
    setSelected((sel) => (sel.includes(label) ? sel.filter((l) => l !== label) : [...sel, label]));
  }
  function onKey(e: React.KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }
  function pickExample(t: string) {
    setFreeText(t);
  }
  function focusCustom() {
    customRef.current?.focus();
  }

  async function submit() {
    if (agentTyping || done) return;
    const idx = stepIndex;
    const step = FLOW[idx];
    const isIdea = idx === 0;
    const ftrim = freeText.trim();

    if (isIdea ? !ftrim : selected.length === 0 && !ftrim) return;

    if (isIdea) {
      ideaRef.current = ftrim;
      setPrd((p) => ({ ...p, title: toTitle(ftrim), goal: { ...p.goal, status: "filling" } }));
      setMessages((m) => [...m, { role: "user", kind: "text", text: ftrim }]);
    } else {
      const answer: Answer = { labels: selected.slice(), free: ftrim };
      answersRef.current[step.id] = answer;
      setMessages((m) => [...m, { role: "user", kind: "choices", chips: selected.slice(), note: ftrim }]);
      setPrd((p) => ({ ...p, [step.section]: { ...p[step.section], status: "filling" } }));
    }

    setFreeText("");
    setSelected([]);
    setAgentTyping(true);

    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;
    await runStep(idx, step, controller.signal);
  }

  async function runStep(idx: number, step: (typeof FLOW)[number], signal: AbortSignal) {
    if (step.id === "idea") {
      await delay(THINKING_MS);
      if (signal.aborted) return;
      pushAgentMessage(FLOW[1].say!);
      setAgentTyping(false);
      setStepIndex(1);
      return;
    }

    if (step.id === "problem") {
      const audience = listFrom(answersRef.current.audience);
      const problem = listFrom(answersRef.current.problem);
      const input = `Idea: ${ideaRef.current}\nAudience: ${joinNice(audience) || "unspecified"}\nPain points: ${joinNice(problem) || "unspecified"}`;
      try {
        const text = await streamGenerate(
          "wizard-goal",
          input,
          (acc) => setPrd((p) => ({ ...p, goal: { status: "filling", text: acc } })),
          signal,
        );
        setPrd((p) => ({ ...p, goal: { status: "done", text: text.trim() } }));
      } catch {
        if (signal.aborted) return;
        setPrd((p) => ({ ...p, goal: { status: "done", text: fallbackGoalText(ideaRef.current, audience, problem) } }));
        showToast("Couldn't reach Claude — used a quick local draft instead.");
      }
      if (signal.aborted) return;
      pushAgentMessage(FLOW[3].say!);
      setAgentTyping(false);
      setStepIndex(3);
      return;
    }

    if (step.id === "requirements") {
      const reqLabels = listFrom(answersRef.current.requirements);
      const input = `Idea: ${ideaRef.current}\nMust-have v1 capabilities: ${joinNice(reqLabels) || "unspecified"}`;
      setPrd((p) => ({ ...p, acceptance: { ...p.acceptance, status: "filling" } }));
      try {
        const text = await streamGenerate(
          "wizard-requirements",
          input,
          (acc) => {
            const parsed = parseHeadedLists(acc);
            setPrd((p) => ({
              ...p,
              requirements: { status: "filling", items: parsed.requirements },
              acceptance: { status: "filling", items: parsed.acceptance },
            }));
          },
          signal,
        );
        const final = parseHeadedLists(text);
        setPrd((p) => ({
          ...p,
          requirements: { status: "done", items: final.requirements.length ? final.requirements : reqLabels },
          acceptance: { status: "done", items: final.acceptance.length ? final.acceptance : fallbackAcceptance() },
        }));
      } catch {
        if (signal.aborted) return;
        setPrd((p) => ({
          ...p,
          requirements: { status: "done", items: reqLabels },
          acceptance: { status: "done", items: fallbackAcceptance() },
        }));
        showToast("Couldn't reach Claude — showing your raw selections instead.");
      }
      if (signal.aborted) return;
      pushAgentMessage(FLOW[4].say!);
      setAgentTyping(false);
      setStepIndex(4);
      return;
    }

    // audience, scope, metrics, risks: literal selections, no AI call needed.
    const items = listFrom(answersRef.current[step.id]);
    await delay(THINKING_MS);
    if (signal.aborted) return;
    setPrd((p) => ({ ...p, [step.section]: { status: "done", items } }));

    const nextIdx = idx + 1;
    if (nextIdx <= 6) {
      pushAgentMessage(FLOW[nextIdx].say!);
      setAgentTyping(false);
      setStepIndex(nextIdx);
    } else {
      pushAgentMessage(FINAL_SAY);
      setAgentTyping(false);
      setDone(true);
      setStepIndex(7);
    }
  }

  function reset() {
    abortRef.current?.abort();
    if (toastTimer.current) clearTimeout(toastTimer.current);
    ideaRef.current = "";
    answersRef.current = {};
    setStepIndex(0);
    setMessages([]);
    setSelected([]);
    setFreeText("");
    setAgentTyping(false);
    setDone(false);
    setToast("");
    setPrd(emptyPrd());
    setCritique({ status: "idle", findings: [] });
  }

  async function copyMd() {
    try {
      await navigator.clipboard.writeText(buildMarkdownPrd(prd));
    } catch {
      // clipboard access can fail silently (e.g. insecure context); the toast still confirms intent.
    }
    showToast("Copied to clipboard");
  }
  function exportMd() {
    try {
      const blob = new Blob([buildMarkdownPrd(prd)], { type: "text/markdown" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(prd.title || "PRD").replace(/[^a-z0-9]+/gi, "-").toLowerCase().replace(/^-|-$/g, "")}.md`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // best-effort download; toast still fires so the user gets feedback either way.
    }
    showToast("Markdown downloaded");
  }

  async function checkConsistency() {
    if (critique.status === "checking") return;
    setCritique({ status: "checking", findings: [] });

    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;
    const signal = controller.signal;

    try {
      const text = await streamGenerate("wizard-critique", buildMarkdownPrd(prd), undefined, signal);
      if (signal.aborted) return;
      const findings = parseCritique(text);
      setCritique({ status: "done", findings });
      if (findings.length === 0) showToast("No contradictions found");
    } catch (err) {
      if (signal.aborted) return;
      setCritique({ status: "idle", findings: [] });
      if (err instanceof Error && /too long/i.test(err.message)) {
        showToast("PRD is too long for a consistency check — try trimming free-text answers.");
      } else {
        showToast("Couldn't reach Claude — try again in a moment.");
      }
    }
  }

  const showPrd = layout === "split";
  const agentInitial = AGENT_NAME.charAt(0).toUpperCase();
  const isIdea = !done && !agentTyping && stepIndex === 0;
  const step = FLOW[stepIndex];
  const hasOptions = !done && !agentTyping && !!step?.options;
  const canSend = isIdea ? !!freeText.trim() : selected.length > 0 || !!freeText.trim();
  const sendDisabled = !canSend || agentTyping;
  const customActive = !!freeText.trim();

  const doneCount = SECTION_ORDER.filter((o) => prd[o.key].status === "done").length;
  const completion = Math.round((doneCount / SECTION_ORDER.length) * 100);

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: "#0a0906", color: "#ede8dd", overflow: "hidden" }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 22px",
          height: 58,
          flex: "none",
          borderBottom: "1px solid rgba(201,165,99,.12)",
          background: "#0c0a07",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              background: "rgba(201,165,99,.12)",
              border: "1px solid rgba(201,165,99,.3)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#c9a563",
              fontWeight: 700,
              fontSize: 13,
              fontFamily: "var(--font-geist-mono)",
            }}
          >
            PO
          </div>
          <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.25 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: "#ede8dd", letterSpacing: "-.01em", whiteSpace: "nowrap" }}>
              Product Owner Copilot
            </span>
            <span style={{ fontSize: 11, color: "#7d7566" }}>PRD generator · powered by {ACTIVE_MODEL.label}</span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <a
            href="https://github.com/Volkidesu/po-copilot"
            target="_blank"
            rel="noopener noreferrer"
            className="po-link"
            style={{ fontSize: 12, color: "#7d7566", textDecoration: "none" }}
          >
            Source on GitHub
          </a>
          <div style={{ display: "flex", gap: 4, background: "#141210", border: "1px solid rgba(201,165,99,.12)", borderRadius: 9, padding: 3 }}>
            <button onClick={() => setLayout("split")} style={tabStyle(layout === "split")}>
              Split
            </button>
            <button onClick={() => setLayout("focus")} style={tabStyle(layout === "focus")}>
              Focus
            </button>
          </div>
        </div>
      </header>

      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <section style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", background: "#0a0906" }}>
          <div ref={chatRef} style={{ flex: 1, overflowY: "auto", padding: "26px 0" }}>
            <div style={{ maxWidth: 680, margin: "0 auto", padding: "0 24px", display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ display: "flex", gap: 11, alignItems: "flex-start", animation: "fadeUp .25s ease" }}>
                <AgentAvatar initial={agentInitial} />
                <div
                  style={{
                    background: "#141210",
                    border: "1px solid rgba(201,165,99,.14)",
                    borderRadius: "4px 13px 13px 13px",
                    padding: "12px 15px",
                    fontSize: 14,
                    lineHeight: 1.62,
                    color: "#e3ddd0",
                    maxWidth: "86%",
                  }}
                >
                  Hi — I&apos;m {AGENT_NAME}, your Product Owner copilot. Describe the product or feature you&apos;d like a PRD
                  for, and I&apos;ll ask a few sharp questions while drafting the document live on the right. A sentence or
                  two is plenty to start.
                </div>
              </div>

              {messages.map((m, i) => (
                <MessageBubble key={i} message={m} agentInitial={agentInitial} />
              ))}

              {agentTyping && (
                <div style={{ display: "flex", gap: 11, alignItems: "center", animation: "fadeUp .2s ease" }}>
                  <AgentAvatar initial={agentInitial} />
                  <div style={{ background: "#141210", border: "1px solid rgba(201,165,99,.14)", borderRadius: 13, padding: "13px 15px", display: "flex", gap: 5 }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#c9a563", animation: "blink 1.2s infinite" }} />
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#c9a563", animation: "blink 1.2s infinite .2s" }} />
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#c9a563", animation: "blink 1.2s infinite .4s" }} />
                  </div>
                </div>
              )}
            </div>
          </div>

          <div style={{ flex: "none", borderTop: "1px solid rgba(201,165,99,.12)", background: "#0d0b08" }}>
            <div style={{ maxWidth: 680, margin: "0 auto", padding: "15px 24px 18px" }}>
              {done ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                    <span
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: "50%",
                        background: "#c9a563",
                        color: "#0a0906",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 12,
                        fontWeight: 700,
                        flex: "none",
                      }}
                    >
                      ✓
                    </span>
                    <span style={{ fontSize: 13, color: "#ede8dd", fontWeight: 600 }}>
                      PRD ready — {completion}% complete. Edit any section on the right, or export.
                    </span>
                  </div>
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
                  {toast && <div style={{ fontSize: 12, color: "#c9a563", fontFamily: "var(--font-geist-mono)" }}>{toast}</div>}
                </div>
              ) : (
                <>
                  {hasOptions && (
                    <>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 9, marginBottom: 12 }}>
                        {step.options!.map(([label, desc]) => {
                          const sel = selected.includes(label);
                          return (
                            <button key={label} onClick={() => toggleOption(label)} className="po-card" style={cardStyle(sel)}>
                              <span style={boxStyle(sel)}>✓</span>
                              <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                                <span style={{ fontSize: 13, fontWeight: 600, color: "#ede8dd" }}>{label}</span>
                                <span style={{ fontSize: 11.5, lineHeight: 1.45, color: "#7d7566" }}>{desc}</span>
                              </span>
                            </button>
                          );
                        })}
                        <div
                          onClick={focusCustom}
                          className="po-card"
                          style={{ ...cardStyle(customActive), gridColumn: "1 / -1" }}
                        >
                          <span style={boxStyle(customActive)}>✓</span>
                          <span style={{ display: "flex", flexDirection: "column", gap: 5, minWidth: 0, flex: 1 }}>
                            <span style={{ fontSize: 13, fontWeight: 600, color: "#ede8dd" }}>Add your own</span>
                            <input
                              value={freeText}
                              onChange={(e) => setFreeText(e.target.value)}
                              onKeyDown={onKey}
                              ref={customRef}
                              disabled={agentTyping}
                              placeholder="Type an option that's missing…"
                              className="po-input"
                              style={{
                                width: "100%",
                                background: "transparent",
                                border: "none",
                                borderBottom: "1px solid rgba(201,165,99,.28)",
                                color: "#ede8dd",
                                fontFamily: "inherit",
                                fontSize: 13,
                                lineHeight: 1.55,
                                padding: "3px 0",
                                outline: "none",
                              }}
                            />
                          </span>
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
                        <span style={{ fontSize: 11, color: "#7d7566", fontFamily: "var(--font-geist-mono)" }}>
                          Check any that apply, and/or add your own.
                        </span>
                        <button onClick={submit} disabled={sendDisabled} style={sendStyle(sendDisabled)}>
                          Add to PRD
                        </button>
                      </div>
                    </>
                  )}

                  {isIdea && (
                    <>
                      <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 11, alignItems: "center" }}>
                        <span style={{ fontSize: 11, color: "#6a6354", fontFamily: "var(--font-geist-mono)" }}>Try</span>
                        {EXAMPLES.map((ex) => (
                          <button
                            key={ex}
                            onClick={() => pickExample(ex)}
                            className="po-chip"
                            style={{
                              border: "1px solid rgba(201,165,99,.18)",
                              background: "#141210",
                              color: "#bdb4a3",
                              borderRadius: 999,
                              padding: "6px 12px",
                              fontSize: 12,
                              fontFamily: "inherit",
                              cursor: "pointer",
                            }}
                          >
                            {ex}
                          </button>
                        ))}
                      </div>
                      <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
                        <textarea
                          value={freeText}
                          onChange={(e) => setFreeText(e.target.value)}
                          onKeyDown={onKey}
                          disabled={agentTyping}
                          placeholder="Describe your product or feature in a sentence or two…"
                          rows={1}
                          className="po-textarea"
                          style={{
                            flex: 1,
                            resize: "none",
                            minHeight: 46,
                            maxHeight: 140,
                            background: "#141210",
                            border: "1px solid rgba(201,165,99,.18)",
                            borderRadius: 11,
                            color: "#ede8dd",
                            fontFamily: "inherit",
                            fontSize: 14,
                            lineHeight: 1.5,
                            padding: "12px 14px",
                            outline: "none",
                          }}
                        />
                        <button onClick={submit} disabled={sendDisabled} style={sendStyle(sendDisabled)}>
                          Start
                        </button>
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </section>

        {showPrd && (
          <section style={{ flex: 1.05, minHeight: 0, overflowY: "auto", background: "#0a0906", borderLeft: "1px solid rgba(201,165,99,.12)" }}>
            <div style={{ maxWidth: 660, margin: "0 auto", padding: "34px 38px 90px" }}>
              <p style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".16em", color: "#c9a563", margin: "0 0 11px", fontFamily: "var(--font-geist-mono)" }}>
                Product Requirements Document
              </p>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 7 }}>
                <h1 style={{ fontSize: 26, fontWeight: 600, letterSpacing: "-.015em", lineHeight: 1.22, margin: 0, color: "#ede8dd", flex: 1, textWrap: "balance" }}>
                  {prd.title || "Untitled product"}
                </h1>
                <span
                  style={{
                    flex: "none",
                    background: "rgba(201,165,99,.1)",
                    color: "#c9a563",
                    borderRadius: 999,
                    padding: "3px 11px",
                    fontSize: 11,
                    fontWeight: 600,
                    fontFamily: "var(--font-geist-mono)",
                    marginTop: 4,
                  }}
                >
                  {done ? "Complete" : "Draft"}
                </span>
              </div>
              <p style={{ fontSize: 12, color: "#7d7566", margin: "0 0 18px", fontFamily: "var(--font-geist-mono)" }}>
                Draft v0.1 · generated with PO Copilot
              </p>
              <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 4 }}>
                <div style={{ flex: 1, height: 5, borderRadius: 999, background: "rgba(201,165,99,.1)", overflow: "hidden" }}>
                  <div style={{ height: "100%", background: "#c9a563", borderRadius: 999, transition: "width .55s ease", width: `${completion}%` }} />
                </div>
                <span style={{ fontSize: 11, color: "#7d7566", fontFamily: "var(--font-geist-mono)" }}>{completion}%</span>
              </div>

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
                    <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 11 }}>
                      <span style={{ fontFamily: "var(--font-geist-mono)", fontSize: 11, color: "#5f5848" }}>
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <h3 style={{ fontSize: 12, fontWeight: 600, color: "#c9a563", margin: 0, textTransform: "uppercase", letterSpacing: ".11em" }}>
                        {o.title}
                      </h3>
                    </div>

                    {s.status === "empty" && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {(o.kind === "para" ? ["96%", "88%", "62%"] : ["56%", "74%", "50%"]).map((w, gi) => (
                          <div key={gi} style={{ height: 9, borderRadius: 4, background: "rgba(201,165,99,.06)", width: w }} />
                        ))}
                      </div>
                    )}

                    {s.status === "filling" && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {(o.kind === "para" ? [["92%", "68%"]] : [["56%", "74%"]])[0].map((w, gi) => (
                          <div
                            key={gi}
                            style={{
                              height: 9,
                              borderRadius: 4,
                              width: w,
                              background: "linear-gradient(90deg,rgba(201,165,99,.07),rgba(201,165,99,.24),rgba(201,165,99,.07))",
                              backgroundSize: "200% 100%",
                              animation: "shimmer 1.1s linear infinite",
                            }}
                          />
                        ))}
                        {o.kind === "list" && (s as { items: string[] }).items.length > 0 && (
                          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 9 }}>
                            {(s as { items: string[] }).items.map((it, ii) => (
                              <li key={ii} style={{ display: "flex", gap: 10, fontSize: 13.5, lineHeight: 1.55, color: "#cdc5b6" }}>
                                <span style={{ color: "#c9a563", flex: "none", marginTop: 1 }}>—</span>
                                <span>{it}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                        <div style={{ fontSize: 11, color: "#c9a563", fontFamily: "var(--font-geist-mono)", marginTop: 3 }}>Drafting…</div>
                      </div>
                    )}

                    {s.status === "done" && o.kind === "para" && (
                      <p style={{ fontSize: 14, lineHeight: 1.72, color: "#cdc5b6", margin: 0, textWrap: "pretty", animation: "fadeUp .3s ease" }}>
                        {(s as { text: string }).text}
                      </p>
                    )}

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
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function ghostButtonBase(primary: boolean): CSSProperties {
  return primary
    ? { border: "none", borderRadius: 9, padding: "10px 16px", fontSize: 13, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", color: "#0a0906", background: "#c9a563" }
    : {
        border: "1px solid rgba(201,165,99,.2)",
        background: "transparent",
        borderRadius: 9,
        padding: "10px 16px",
        fontSize: 13,
        fontWeight: 500,
        fontFamily: "inherit",
        cursor: "pointer",
        color: "#bdb4a3",
      };
}

function AgentAvatar({ initial }: { initial: string }) {
  return (
    <div
      style={{
        width: 28,
        height: 28,
        borderRadius: 7,
        flex: "none",
        background: "rgba(201,165,99,.12)",
        border: "1px solid rgba(201,165,99,.25)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#c9a563",
        fontSize: 11,
        fontWeight: 700,
        fontFamily: "var(--font-geist-mono)",
      }}
    >
      {initial}
    </div>
  );
}

function MessageBubble({ message, agentInitial }: { message: ChatMessage; agentInitial: string }) {
  if (message.role === "agent") {
    return (
      <div style={{ display: "flex", gap: 11, alignItems: "flex-start", animation: "fadeUp .25s ease" }}>
        <AgentAvatar initial={agentInitial} />
        <div
          style={{
            background: "#141210",
            border: "1px solid rgba(201,165,99,.14)",
            borderRadius: "4px 13px 13px 13px",
            padding: "12px 15px",
            fontSize: 14,
            lineHeight: 1.62,
            color: "#e3ddd0",
            maxWidth: "86%",
          }}
        >
          {message.text}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", justifyContent: "flex-end", animation: "fadeUp .25s ease" }}>
      <div style={{ maxWidth: "86%", display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
        {message.kind === "text" && (
          <div
            style={{
              background: "rgba(201,165,99,.14)",
              border: "1px solid rgba(201,165,99,.28)",
              borderRadius: "13px 4px 13px 13px",
              padding: "11px 15px",
              fontSize: 14,
              lineHeight: 1.55,
              color: "#f1ecdf",
            }}
          >
            {message.text}
          </div>
        )}
        {message.kind === "choices" && message.chips.length > 0 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
            {message.chips.map((c) => (
              <span
                key={c}
                style={{
                  background: "rgba(201,165,99,.14)",
                  border: "1px solid rgba(201,165,99,.3)",
                  borderRadius: 999,
                  padding: "4px 12px",
                  fontSize: 12,
                  color: "#f1ecdf",
                }}
              >
                {c}
              </span>
            ))}
          </div>
        )}
        {message.kind === "choices" && message.note && (
          <div
            style={{
              background: "#141210",
              border: "1px solid rgba(201,165,99,.18)",
              borderRadius: "13px 4px 13px 13px",
              padding: "9px 13px",
              fontSize: 13,
              color: "#cdc5b6",
              lineHeight: 1.5,
            }}
          >
            {message.note}
          </div>
        )}
      </div>
    </div>
  );
}
