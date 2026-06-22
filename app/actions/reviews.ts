"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { getOwner } from "@/lib/admin/guard";
import { getReviewSettings } from "@/lib/reviews/data";
import { sendEmail } from "@/lib/email/resend";

// ── Public: submit a review ─────────────────────────────────────────────────

const SubmitInput = z.object({
  author_name: z.string().trim().min(2, "Please enter your name").max(60),
  rating: z.coerce.number().int().min(1).max(5),
  title: z.string().trim().max(80).optional().or(z.literal("")),
  body: z
    .string()
    .trim()
    .min(10, "Tell us a little more (10+ characters)")
    .max(1000),
  author_email: z.string().trim().email().max(160).optional().or(z.literal("")),
  // Honeypot — real users leave this empty; bots fill every field.
  company: z.string().max(0).optional(),
});

export type SubmitReviewResult =
  | { ok: true; pending: boolean }
  | { ok: false; error: string };

function ownerNotifyEmail(): string | null {
  const first = (v?: string) =>
    v?.split(",").map((s) => s.trim()).filter(Boolean)[0];
  return (
    process.env.OWNER_NOTIFY_EMAIL ||
    first(process.env.ADMIN_EMAILS) ||
    first(process.env.INTERNAL_EMAILS) ||
    null
  );
}

export async function submitReview(
  input: z.infer<typeof SubmitInput>,
): Promise<SubmitReviewResult> {
  const parsed = SubmitInput.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid review",
    };
  }
  // Honeypot tripped → pretend success, drop silently.
  if (parsed.data.company && parsed.data.company.length > 0) {
    return { ok: true, pending: true };
  }

  const settings = await getReviewSettings();
  // Respect the owner's master switch and form toggle on the server too —
  // never accept a submission for a surface the owner turned off.
  if (!settings.enabled || !settings.show_form) {
    return { ok: false, error: "Reviews are not open right now." };
  }

  const status = settings.auto_approve ? "approved" : "pending";
  const email = parsed.data.author_email?.trim() || null;

  try {
    const svc = createSupabaseServiceClient();
    const { error } = await svc.from("reviews").insert({
      author_name: parsed.data.author_name,
      author_email: email,
      rating: parsed.data.rating,
      title: parsed.data.title?.trim() || null,
      body: parsed.data.body,
      status,
      approved_at: status === "approved" ? new Date().toISOString() : null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    if (error) return { ok: false, error: "Could not save your review." };
  } catch {
    return { ok: false, error: "Could not save your review." };
  }

  // Best-effort owner notification — never blocks or fails the submission.
  try {
    const to = ownerNotifyEmail();
    if (to) {
      const stars = "★".repeat(parsed.data.rating) + "☆".repeat(5 - parsed.data.rating);
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://elitevaultapp.com";
      await sendEmail({
        to,
        subject: `New review (${parsed.data.rating}/5) from ${parsed.data.author_name}${status === "pending" ? " — needs approval" : ""}`,
        html: `
          <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;color:#14141B">
            <h2 style="margin:0 0 4px">New EliteVault review</h2>
            <p style="color:#6b7280;margin:0 0 16px">${status === "pending" ? "Pending your approval." : "Auto-approved and live."}</p>
            <div style="border:1px solid #e5e7eb;border-radius:12px;padding:16px">
              <div style="font-size:18px;color:#d4a017">${stars} <span style="color:#6b7280;font-size:13px">(${parsed.data.rating}/5)</span></div>
              ${parsed.data.title ? `<p style="font-weight:700;margin:8px 0 4px">${escapeHtml(parsed.data.title)}</p>` : ""}
              <p style="margin:6px 0;white-space:pre-wrap">${escapeHtml(parsed.data.body)}</p>
              <p style="color:#6b7280;font-size:13px;margin:10px 0 0">— ${escapeHtml(parsed.data.author_name)}${email ? ` &lt;${escapeHtml(email)}&gt;` : ""}</p>
            </div>
            <p style="margin:18px 0 0"><a href="${appUrl}/app/owner" style="color:#0d9488">Manage reviews in your owner panel →</a></p>
          </div>`,
      });
    }
  } catch {
    // ignore — notification is non-critical
  }

  revalidatePath("/");
  revalidatePath("/app/owner");
  return { ok: true, pending: status === "pending" };
}

// ── Owner-only: moderation + settings ───────────────────────────────────────

async function assertOwner() {
  const owner = await getOwner();
  if (!owner) throw new Error("Unauthorized");
}

const SettingsPatch = z.object({
  enabled: z.boolean().optional(),
  show_form: z.boolean().optional(),
  show_list: z.boolean().optional(),
  display_count: z.coerce.number().int().min(0).max(60).optional(),
  min_rating: z.coerce.number().int().min(1).max(5).optional(),
  auto_approve: z.boolean().optional(),
  heading: z.string().max(120).nullable().optional(),
  subheading: z.string().max(240).nullable().optional(),
});

export async function updateReviewSettings(
  patch: z.infer<typeof SettingsPatch>,
): Promise<{ ok: boolean; error?: string }> {
  await assertOwner();
  const parsed = SettingsPatch.safeParse(patch);
  if (!parsed.success) return { ok: false, error: "Invalid settings" };
  try {
    const svc = createSupabaseServiceClient();
    // The hand-written Database type doesn't include these tables, so the
    // typed builder infers a `never` row. Cast the builder (matches the
    // service-client pattern used elsewhere, e.g. sitemap.ts).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (svc.from("review_settings") as any)
      .update({ ...parsed.data, updated_at: new Date().toISOString() })
      .eq("id", true);
    if (error) return { ok: false, error: error.message };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  revalidatePath("/");
  revalidatePath("/app/owner");
  return { ok: true };
}

export async function setReviewStatus(
  id: string,
  status: "pending" | "approved" | "hidden",
): Promise<{ ok: boolean; error?: string }> {
  await assertOwner();
  try {
    const svc = createSupabaseServiceClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (svc.from("reviews") as any)
      .update({
        status,
        approved_at: status === "approved" ? new Date().toISOString() : null,
      })
      .eq("id", id);
    if (error) return { ok: false, error: error.message };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  revalidatePath("/");
  revalidatePath("/app/owner");
  return { ok: true };
}

export async function setReviewFeatured(
  id: string,
  featured: boolean,
): Promise<{ ok: boolean; error?: string }> {
  await assertOwner();
  try {
    const svc = createSupabaseServiceClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (svc.from("reviews") as any)
      .update({ featured })
      .eq("id", id);
    if (error) return { ok: false, error: error.message };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  revalidatePath("/");
  revalidatePath("/app/owner");
  return { ok: true };
}

export async function deleteReview(
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  await assertOwner();
  try {
    const svc = createSupabaseServiceClient();
    const { error } = await svc.from("reviews").delete().eq("id", id);
    if (error) return { ok: false, error: error.message };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  revalidatePath("/");
  revalidatePath("/app/owner");
  return { ok: true };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
