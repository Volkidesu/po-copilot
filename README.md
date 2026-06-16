# PO-Copilot

An AI product copilot that turns a product idea into a structured **PRD** (Product Requirements Document) — streamed live from Claude.

> Built by [Volkan Bulut](https://www.linkedin.com/) — a product manager moving into AI Product Management, building the things instead of just specifying them.

**Live demo:** [po-copilot.vercel.app](https://po-copilot.vercel.app)

---

## What it does

Takes a product idea described in 2–3 sentences and generates a complete, structured PRD including:

- Problem & Context
- Goals and Non-Goals
- Target Users & Personas
- High-level User Stories
- Functional and Non-Functional Requirements
- **Measurable Success Metrics** (real KPIs, not vague statements)
- Risks & Open Questions
- Milestones

The system prompt encodes real product-management craft, so the output reads like a strong product owner wrote it.

## Why I built it

As a PM, I know what a *good* PRD looks like. This tool encodes that judgment into the prompt — so it's both a useful product and a demonstration that I can design *and* ship an AI feature end to end.

## How it works

- **System prompt.** A tailored Claude system prompt in [`src/lib/prompts.ts`](src/lib/prompts.ts) encodes product management best practices.
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

Open [http://localhost:3000](http://localhost:3000), click **Insert example**, and **Generate**.

Get an API key at [console.anthropic.com](https://console.anthropic.com). `.env.local` is gitignored — your key never enters the repo.
