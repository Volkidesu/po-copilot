import { anthropic } from "@ai-sdk/anthropic";
import { streamText } from "ai";
import { SYSTEM_PROMPTS, type Mode } from "@/lib/prompts";
import { ACTIVE_MODEL } from "@/lib/model";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

// Allow streamed generations to run up to 60s on Vercel.
export const maxDuration = 60;

export async function POST(req: Request) {
  const { allowed, retryAfterSeconds } = checkRateLimit(getClientIp(req));
  if (!allowed) {
    return new Response("Too many requests. Please slow down and try again shortly.", {
      status: 429,
      headers: { "Retry-After": String(retryAfterSeconds) },
    });
  }

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
    model: anthropic(ACTIVE_MODEL.id),
    system,
    prompt: input,
  });

  return result.toTextStreamResponse();
}
