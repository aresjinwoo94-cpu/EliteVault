import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getProvider, isAIConfigured } from "@/ai/provider";
import { retrieve, type KbEntry } from "@/lib/support/kb";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { enterMeter } from "@/lib/usage/context";
import { COMPANY } from "@/lib/company";
import { getT } from "@/lib/i18n/server";

export const runtime = "nodejs";

// i18n-ignore: support KB answers are grounded English content (out of scope), not UI chrome
const FALLBACK = `I don't have that documented yet. For anything I can't answer, use the contact form at /support/contact (it reaches the founder's inbox) or email ${COMPANY.contactEmail} — a human will help.`;

/** The Instagram handle, derived from the single source in lib/company. */
const IG_HANDLE = "@" + COMPANY.socials.instagram.replace(/\/+$/, "").split("/").pop();

// "I want to talk to a real person / the founder" — answered WITHOUT the model,
// so the intent can never be lost to a hallucinated or declined reply. Matches
// English + Spanish. Word-boundaried where a bare substring would over-match.
const OWNER_INTENT =
  /\b(owner|founder|human|person|real person|talk to|speak to|contact|ariel)\b|dueñ|fundador|human|humano|persona|hablar con|contact|contacto/i;

/** Bilingual "reach the founder" reply. Spanish when the question looks Spanish. */
function ownerHandoffAnswer(question: string): string {
  const looksSpanish =
    /dueñ|fundador|humano|persona|hablar|contacto|quiero|puedo|cómo|como/i.test(
      question,
    );
  return looksSpanish
    // i18n-ignore: support KB answer (grounded content)
    ? `Puedes escribirle directo al fundador con el formulario de contacto en /support/contact (le llega a su correo), o por Instagram ${IG_HANDLE}.`
    // i18n-ignore: support KB answer (grounded content)
    : `You can reach the founder directly through the contact form at /support/contact (it lands in his inbox), or on Instagram ${IG_HANDLE}.`;
}

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
  // i18n-ignore: LLM system prompt
  "You are EliteVault's support assistant. Answer the user's question ONLY " +
  "using the FACTS provided. Do NOT invent or guess prices, dates, policies, " +
  "limits, or features — if the facts don't cover it, you must decline. Keep " +
  "answers concise (1-3 sentences) and friendly. If (and only if) the facts " +
  "do not answer the question, set answered=false and tell the user you don't " +
  `have that documented and to use the contact form at /support/contact or ` +
  `email ${COMPANY.contactEmail}. Never promise ` +
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
  const { t } = await getT();
  const ip = (req.headers.get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
  if (rateLimited(ip)) {
    return NextResponse.json(
      { answer: t("supportChat.rateLimited"), answered: false },
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

  // "Talk to a human / the founder" — answer WITHOUT the model. This intent must
  // never depend on the AI being up or on the KB matching; it routes straight to
  // the contact form + Instagram. Logged as answered (we did answer it).
  if (OWNER_INTENT.test(question)) {
    void logQuestion(question, true);
    return NextResponse.json({ answer: ownerHandoffAnswer(question), answered: true });
  }

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
        // i18n-ignore: LLM prompt
        description: "Answer strictly from the provided EliteVault facts.",
        schema: TOOL_SCHEMA as unknown as Record<string, unknown>,
      },
      {
        system: SYSTEM,
        temperature: 0.2,
        maxTokens: 400,
        fast: true,
        parts: [
          // i18n-ignore: LLM prompt
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
