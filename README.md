# PO-Copilot

An AI product copilot that turns a product idea into a structured **PRD**, breaks a PRD into **epics & user stories**, and drafts **release notes** from a changelog — all streamed live from Claude.

> Built by [Volkan Bulut](https://www.linkedin.com/) — a product manager moving into AI Product Management, building the things instead of just specifying them.

**Live demo:** [po-copilot.vercel.app](https://po-copilot.vercel.app)

---

## What it does

Three modes, each backed by a system prompt that encodes real product-management craft:

| Mode | Input | Output |
|------|-------|--------|
| **PRD** | A product idea in 2–3 sentences | A complete PRD (problem, goals/non-goals, personas, requirements, **measurable success metrics**, risks, milestones) |
| **Epics & User Stories** | A PRD or feature description | Epics with INVEST-checked user stories and Given/When/Then acceptance criteria |
| **Release Notes** | Rough shipped-changes notes | Polished user-facing release notes + an internal changelog |

A one-click **chaining** step generates epics & stories directly from a freshly written PRD — demonstrating prompt chaining, not just single-shot generation.

## Why I built it

As a PM, I know what a *good* PRD, a well-sliced user story, and clear release notes look like. This tool encodes that judgment into the prompts — so it's both a useful product and a demonstration that I can design *and* ship an AI feature end to end.

## How it works

- **Mode → system prompt.** Each mode maps to a tailored Claude system prompt in [`src/lib/prompts.ts`](src/lib/prompts.ts).
- **Streaming route handler.** [`src/app/api/generate/route.ts`](src/app/api/generate/route.ts) validates the request and streams the response from Claude via the Vercel AI SDK (`streamText` → `toTextStreamResponse`).
- **Client.** [`src/app/page.tsx`](src/app/page.tsx) reads the stream and renders it as Markdown in real time.

## Tech stack

- **Next.js** (App Router) + **TypeScript** + **Tailwind CSS**
- **Vercel AI SDK** (`ai`, `@ai-sdk/anthropic`) for streaming
- **Claude Sonnet 4.6** as the generation model
- Deployed on **Vercel**

## Run locally

```bash
git clone https://github.com/Volkidesu/po-copilot.git
cd po-copilot
npm install

# add your Anthropic API key
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env.local

npm run dev
```

Open [http://localhost:3000](http://localhost:3000), pick a mode, click **Insert example**, and **Generate**.

Get an API key at [console.anthropic.com](https://console.anthropic.com). `.env.local` is gitignored — your key never enters the repo.
