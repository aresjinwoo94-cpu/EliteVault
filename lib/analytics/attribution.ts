/**
 * Sign-up attribution (docs/owner-monitor-v2.md §3.3): link the first-party
 * `ev_vid` visitor to the new account and copy its first-touch channel onto
 * `profiles.acq_*`. Pure orchestration over a small store interface so it is
 * unit-tested; the callback wires the real Supabase store. NEVER throws — the
 * login must not depend on analytics.
 *
 * NOTE: `ev_vid` (this) is NOT the anonymous-audit cookie (`ev_anon`, signed,
 * `analyses.anon_id`, migration 0023). Different cookies; don't mix them.
 */

const FRESH_MS = 15 * 60 * 1000;

export type VisitorRow = {
  anon_id: string;
  user_id: string | null;
  first_channel: string | null;
  first_referrer_domain?: string | null;
  utm_campaign?: string | null;
  first_landing_path?: string | null;
};

export type Acq = {
  acq_channel: string | null;
  acq_referrer_domain: string | null;
  acq_utm_campaign: string | null;
  acq_landing_path: string | null;
};

export interface AttributionStore {
  getProfile(userId: string): Promise<{ created_at: string; acq_channel: string | null } | null>;
  getVisitor(anonId: string): Promise<VisitorRow | null>;
  linkVisitor(anonId: string, userId: string): Promise<void>;
  setProfileAcq(userId: string, acq: Acq): Promise<void>;
}

export function isFreshProfile(createdAt: string | null | undefined, now: number): boolean {
  const t = createdAt ? Date.parse(createdAt) : NaN;
  return Number.isFinite(t) && now - t >= 0 && now - t < FRESH_MS;
}

export function profileAcqFromVisitor(v: Partial<VisitorRow>): Acq {
  return {
    acq_channel: v.first_channel ?? null,
    acq_referrer_domain: v.first_referrer_domain ?? null,
    acq_utm_campaign: v.utm_campaign ?? null,
    acq_landing_path: v.first_landing_path ?? null,
  };
}

export async function attributeSignup(
  store: AttributionStore,
  input: { anonId: string | undefined; userId: string; now?: number },
): Promise<"linked" | "skipped" | "error"> {
  try {
    if (!input.anonId) return "skipped";
    const now = input.now ?? Date.now();
    const profile = await store.getProfile(input.userId);
    // Only the sign-up itself: not every login, and never overwrite.
    if (!profile || !isFreshProfile(profile.created_at, now) || profile.acq_channel) return "skipped";
    const visitor = await store.getVisitor(input.anonId);
    if (!visitor || (visitor.user_id && visitor.user_id !== input.userId)) return "skipped";
    await store.linkVisitor(input.anonId, input.userId);
    await store.setProfileAcq(input.userId, profileAcqFromVisitor(visitor));
    return "linked";
  } catch {
    return "error";
  }
}
