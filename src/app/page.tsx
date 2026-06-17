"use client";

import { useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { MODES, type Mode } from "@/lib/prompts";
import { ACTIVE_MODEL } from "@/lib/model";

export default function Home() {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const current = MODES[0];

  async function generate(overrideInput?: string) {
    const useInput = (overrideInput ?? input).trim();
    if (!useInput || isLoading) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setError(null);
    setOutput("");
    setIsLoading(true);

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "prd", input: useInput }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        setError((await res.text()) || "Something went wrong.");
        setIsLoading(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setOutput(acc);
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setError("Network error — is the dev server running?");
      }
    } finally {
      setIsLoading(false);
    }
  }

  function useExample() {
    setInput(current.example);
  }


  async function copyOutput() {
    await navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <main className="mx-auto flex min-h-full w-full max-w-3xl flex-col gap-8 px-5 py-10 sm:py-16">
      {/* Header */}
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-fit rounded-full border border-black/10 px-3 py-1 text-xs font-medium text-zinc-500 dark:border-white/15 dark:text-zinc-400">
            AI Product Copilot · Demo
          </span>
          <span
            title="The model currently generating your output"
            className="flex w-fit items-center gap-1.5 rounded-full border border-black/10 px-3 py-1 text-xs font-medium text-zinc-500 dark:border-white/15 dark:text-zinc-400"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Model: {ACTIVE_MODEL.label}
          </span>
        </div>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          PO-Copilot
        </h1>
        <p className="max-w-xl text-zinc-600 dark:text-zinc-400">
          Turn a product idea into a structured Product Requirements Document —
          powered by Claude. Built by a product manager who ships.
        </p>
      </header>

      {/* Input */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            {current.hint}
          </label>
          <button
            type="button"
            onClick={useExample}
            className="text-sm text-zinc-500 underline-offset-2 hover:underline"
          >
            Insert example
          </button>
        </div>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={current.placeholder}
          rows={6}
          className="w-full resize-y rounded-xl border border-black/10 bg-white p-4 text-sm leading-6 outline-none focus:border-zinc-400 dark:border-white/15 dark:bg-zinc-950"
        />
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => generate()}
            disabled={isLoading || !input.trim()}
            className="rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
          >
            {isLoading ? "Generating…" : "Generate"}
          </button>
          {output && !isLoading && (
            <button
              type="button"
              onClick={copyOutput}
              className="rounded-lg border border-black/10 px-4 py-2.5 text-sm transition-colors hover:bg-black/[.03] dark:border-white/15 dark:hover:bg-white/[.05]"
            >
              {copied ? "Copied!" : "Copy markdown"}
            </button>
          )}
        </div>
      </section>

      {/* Error */}
      {error && (
        <p className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      )}

      {/* Output */}
      {output && (
        <section className="flex flex-col gap-4">
          <div className="prose-output rounded-xl border border-black/10 bg-white p-6 dark:border-white/15 dark:bg-zinc-950">
            <ReactMarkdown>{output}</ReactMarkdown>
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="mt-auto border-t border-black/5 pt-6 text-sm text-zinc-500 dark:border-white/10">
        Demo project · Next.js + Vercel AI SDK + Claude.{" "}
        <a
          href="https://github.com/Volkidesu/po-copilot"
          target="_blank"
          rel="noopener noreferrer"
          className="text-zinc-500 underline-offset-2 hover:underline"
        >
          Source on GitHub
        </a>
        .
      </footer>
    </main>
  );
}
