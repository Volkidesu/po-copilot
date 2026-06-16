import { anthropic } from "@ai-sdk/anthropic";
import { streamText } from "ai";
import { SYSTEM_PROMPTS, type Mode } from "@/lib/prompts";

// Allow streamed generations to run up to 60s on Vercel.
export const maxDuration = 60;

export async function POST(req: Request) {
  let body: { mode?: string; input?: string };
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON body.", { status: 400 });
  }

  const { mode, input } = body;
  const system = SYSTEM_PROMPTS[mode as Mode];

  if (!system) {
    return new Response("Unknown mode.", { status: 400 });
  }
  if (typeof input !== "string" || input.trim().length === 0) {
    return new Response("Please provide some input.", { status: 400 });
  }
  if (input.length > 8000) {
    return new Response("Input too long (max 8000 characters).", { status: 400 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return new Response(
      "Server is missing ANTHROPIC_API_KEY. Add it to .env.local and restart.",
      { status: 500 },
    );
  }

  const result = streamText({
    // Workhorse model for the demo (Claude Sonnet 4.6).
    model: anthropic("claude-sonnet-4-6"),
    system,
    prompt: input,
  });

  return result.toTextStreamResponse();
}
