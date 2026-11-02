import { BASE_CURRENCY } from "./config";

/**
 * Meta simulator: the engine, the DB and Stripe stay in USD. A simulation row
 * additionally remembers the currency it was ENTERED and SHOWN in
 * (display_currency + display_fx_rate), so a reload shows the same figures.
 */
export type SimDisplay = { code: string; rate: number };

export const SIM_USD: SimDisplay = { code: BASE_CURRENCY, rate: 1 };

/** Server-side limits (app/actions/meta-simulator.ts), in USD. */
export const SIM_AOV_MAX_USD = 10_000;
export const SIM_BUDGET_MAX_USD = 50_000;

/** Plausible range for a stored rate (units of currency per USD). */
const RATE_MIN = 1e-6;
const RATE_MAX = 1e7;

export function isUsableRate(rate: unknown): rate is number {
  return typeof rate === "number" && Number.isFinite(rate) && rate > RATE_MIN && rate < RATE_MAX;
}

/**
 * How a stored simulation row is displayed. NULL / junk → USD, exactly like
 * rows created before the columns existed.
 */
export function simDisplayFromRow(
  row: { display_currency?: string | null; display_fx_rate?: number | string | null } | null | undefined,
): SimDisplay {
  const code = row?.display_currency?.trim().toUpperCase() ?? "";
  const rate = Number(row?.display_fx_rate);
  if (!/^[A-Z]{3}$/.test(code) || code === BASE_CURRENCY || !isUsableRate(rate)) return SIM_USD;
  return { code, rate };
}

/** What the user typed (local currency) → the USD the engine takes. Cents. */
export function localToUsd(local: number, rate: number): number {
  if (!isUsableRate(rate)) return local;
  return Math.round((local / rate) * 100) / 100;
}

/** USD → local (display). */
export function usdToLocal(usd: number, rate: number): number {
  return isUsableRate(rate) ? usd * rate : usd;
}
