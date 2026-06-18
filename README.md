# PO-Copilot

A chat-driven Product Owner copilot that interviews you about a product idea and builds a structured **PRD** (Product Requirements Document) live, in a side-by-side panel — backed by real, streamed Claude calls.

> Built by [Volkan Bulut](https://www.linkedin.com/) — a product manager moving into AI Product Management, building the things instead of just specifying them.

**Live demo:** [po-copilot.vercel.app](https://po-copilot.vercel.app)

---

## What it does

Walks through a short guided conversation — idea → audience → pain points → must-have requirements → out of scope → success metrics → risks — using checkbox option chips plus free-text for anything missing. As you answer, the PRD fills in live on the right:

- **Goal & Problem** and **Functional Requirements + Acceptance Criteria** are written by Claude in real time, streamed straight from your answers (no canned text).
- **Target Audience**, **Out of Scope**, **Success Metrics**, and **Risks & Dependencies** are taken directly from your selections.

When it's done, copy the Markdown or download it as a `.md` file.

## Why I built it

As a PM, I know what a *good* PRD looks like and what a good intake conversation looks like. This tool encodes both — the structured interview *and* the judgment about what makes a requirement or acceptance criterion concrete — so it's both a useful product and a demonstration that I can design *and* ship an AI feature end to end.

## How it works

- **Wizard data & flow.** [`src/lib/wizard-data.ts`](src/lib/wizard-data.ts) defines the scripted questions and option chips; [`src/lib/wizard-helpers.ts`](src/lib/wizard-helpers.ts) has the pure helpers (parsing, Markdown export, stream reading).
- **System prompts.** [`src/lib/prompts.ts`](src/lib/prompts.ts) holds two Claude prompts — one for the Goal & Problem paragraph, one for paired Requirements + Acceptance Criteria — each grounded in the structured answers collected so far.
- **Streaming route handler.** [`src/app/api/generate/route.ts`](src/app/api/generate/route.ts) validates the request and streams the response from Claude via the Vercel AI SDK (`streamText` → `toTextStreamResponse`).
- **Client.** [`src/app/page.tsx`](src/app/page.tsx) drives the conversation, fires the two Claude calls at the right points in the flow, and renders the PRD updating live as tokens stream in.

## Tech stack

- **Next.js** (App Router) + **TypeScript**
- **Vercel AI SDK** (`ai`, `@ai-sdk/anthropic`) for streaming
- **Claude Haiku 4.5** as the generation model
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

Open [http://localhost:3000](http://localhost:3000), pick an example idea (or type your own), and answer the questions.

Get an API key at [console.anthropic.com](https://console.anthropic.com). `.env.local` is gitignored — your key never enters the repo.
