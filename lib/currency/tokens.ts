import { BASE_CURRENCY } from "./config";
import { formatMoney, formatPlanPrice, planShowsLocal, type MoneyCtx } from "./format";

/**
 * Money tokens inside translation strings, so copy never hardcodes a currency:
 *
 *   {price:19}              plan/unlock price   USD "$19"      local "≈ MX$360"
 *   {uprice:7}              same, USD "US$7"    (copy that already said US$)
 *   {est:2000|$2,000}       comparison figure   USD literal     local "≈ MX$36K"
 *   {estr:1500:2000|$1.5k–2k}   range           USD literal     local "≈ MX$27K–MX$36K"
 *
 * Without a context (server `translator()`, SEO, emails) or for USD the output
 * is exactly the text we had before; a token can never leak raw.
 */
const TOKEN = /\{(price|uprice|est|estr):([0-9.:]+)(?:\|([^}]*))?\}/g;

export function resolveMoneyTokens(text: string, ctx: MoneyCtx | null): string {
  if (!text.includes("{")) return text;
  const local = !!ctx && ctx.code !== BASE_CURRENCY && Number.isFinite(ctx.rate) && ctx.rate > 0;
  return text.replace(TOKEN, (_m, kind: string, args: string, literal?: string) => {
    const nums = args.split(":").map(Number);
    const usd = nums[0];
    if (!Number.isFinite(usd)) return _m;
    if (kind === "price" || kind === "uprice") {
      if (local && ctx && planShowsLocal(ctx)) return formatPlanPrice(usd, ctx, { approx: true });
      const base = formatMoney(usd, { code: BASE_CURRENCY, rate: 1, locale: ctx?.locale ?? "en" });
      // A visitor whose own currency also uses "$" (ARS, MXN…) must read US$.
      return kind === "uprice" || local ? `US${base}` : base;
    }
    if (!local || !ctx) return literal ?? `$${usd}`;
    if (kind === "est") return formatMoney(usd, ctx, { compact: true, approx: true });
    const hi = nums[1];
    if (!Number.isFinite(hi)) return literal ?? _m;
    return `${formatMoney(usd, ctx, { compact: true, approx: true })}–${formatMoney(hi, ctx, { compact: true })}`;
  });
}
