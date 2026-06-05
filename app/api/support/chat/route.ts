import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getProvider, isAIConfigured } from "@/ai/provider";
import { retrieve, type KbEntry } from "@/lib/support/kb";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { enterMeter } from "@/lib/usage/context";
import { COMPANY } from "@/lib/company";

export const runtime = "nodejs";

const FALLBACK = `I don't have that documented yet. For anything I can't answer, email ${COMPANY.contactEmail} or use the contact form — a human will help.`;

// ── Basic in-memory rate limit (per IP, per Lambda instance) ──────────────
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 12;
const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const arr = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  arr.push(now);
  hits.set(ip, arr);
  return arr.length > MAX_PER_WINDOW;
}

const Body = z.object({ question: z.string().trim().min(2).max(500) });

const SYSTEM =
  "You are EliteVault's support assistant. Answer the user's question ONLY " +
  "using the FACTS provided. Do NOT invent or guess prices, dates, policies, " +
  "limits, or features — if the facts don't cover it, you must decline. Keep " +
  "answers concise (1-3 sentences) and friendly. If (and only if) the facts " +
  "do not answer the question, set answered=false and tell the user you don't " +
  `have that documented and to contact ${COMPANY.contactEmail}. Never promise ` +
  "refunds, guarantees, or anything not stated in the facts.";

const TOOL_SCHEMA = {
  type: "object",
  properties: {
    answer: { type: "string" },
    answered: { type: "boolean" },
  },
  required: ["answer", "answered"],
} as const;

async function logQuestion(question: string, answered: boolean) {
  try {
    const service = createSupabaseServiceClient();
    await service.from("support_questions").insert({ question, answered });
  } catch {
    // best-effort only
  }
}

export async function POST(req: NextRequest) {
  const ip = (req.headers.get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
  if (rateLimited(ip)) {
    return NextResponse.json(
      { answer: "You're sending messages too fast — give it a moment.", answered: false },
      { status: 429 },
    );
  }

  let parsed;
  try {
    parsed = Body.safeParse(await req.json());
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_question" }, { status: 400 });
  }
  const question = parsed.data.question;

  // Retrieve grounding facts. No match OR no AI configured → canned fallback
  // WITHOUT calling the model (saves quota and prevents made-up answers).
  const facts: KbEntry[] = retrieve(question);
  if (facts.length === 0 || !isAIConfigured()) {
    void logQuestion(question, false);
    return NextResponse.json({ answer: FALLBACK, answered: false });
  }

  const factsText = facts
    .map((f, i) => `[${i + 1}] ${f.q}\n${f.a}`)
    .join("\n\n");

  try {
    enterMeter({ userId: null, plan: null, eventType: "support_chat" });
    const provider = await getProvider();
    const result = await provider.generateStructured<{
      answer: string;
      answered: boolean;
    }>(
      {
        name: "answer_support_question",
        description: "Answer strictly from the provided EliteVault facts.",
        schema: TOOL_SCHEMA as unknown as Record<string, unknown>,
      },
      {
        system: SYSTEM,
        temperature: 0.2,
        maxTokens: 400,
        fast: true,
        parts: [
          { text: `FACTS:\n${factsText}\n\nUSER QUESTION: ${question}` },
        ],
      },
    );

    const answer = String(result?.answer ?? "").slice(0, 1200) || FALLBACK;
    const answered = Boolean(result?.answered) && answer.length > 0;
    void logQuestion(question, answered);
    return NextResponse.json({ answer, answered });
  } catch (err) {
    console.warn("[support/chat] failed:", (err as Error).message);
    void logQuestion(question, false);
    return NextResponse.json({ answer: FALLBACK, answered: false });
  }
}
