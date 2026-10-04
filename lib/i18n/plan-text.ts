import type { Plan, PlanFeature } from "@/lib/stripe/plans";

/**
 * Plan copy in the active language.
 *
 * lib/stripe/plans.ts keeps the English text (it is also the source of truth
 * for prices, quotas and Stripe IDs); the translation lives in messages.ts
 * under `plans.<id>.*`, keyed by the feature's index in `plan.features`. Any
 * missing key falls back to the English text, so a plan can never render blank.
 */
export type PlanTranslate = (path: string) => string;

export type LocalizedPlan = Omit<Plan, "features" | "badge" | "description"> & {
  description: string;
  badge?: string;
  features: PlanFeature[];
};

function pick(t: PlanTranslate, key: string, fallback: string): string {
  const value = t(key);
  // translator() returns the key itself on a miss.
  return value === key ? fallback : value;
}

export function localizePlan(plan: Plan, t: PlanTranslate): LocalizedPlan {
  const ns = `plans.${plan.id}`;
  return {
    ...plan,
    name: pick(t, `${ns}.name`, plan.name),
    description: pick(t, `${ns}.desc`, plan.description),
    badge: plan.badge ? pick(t, `${ns}.badge`, plan.badge) : undefined,
    features: plan.features.map((f, i) => ({
      ...f,
      text: pick(t, `${ns}.f${i}`, f.text),
    })),
  };
}
