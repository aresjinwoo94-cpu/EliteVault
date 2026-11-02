"use client";

import { useT } from "@/components/i18n/locale-provider";
import { useMoney } from "@/components/currency/currency-provider";
import { formatPrice } from "@/lib/i18n/format";
import { formatMoney } from "@/lib/currency/format";

/**
 * How a plan/unlock price reads for THIS visitor.
 *  - USD visitor           → exactly what we always showed.
 *  - Adaptive-supported    → "≈ MX$360" (buffered, rounded up) + a small "US$19".
 *  - other currency (ARS…) → USD only + "Billed in USD".
 */
export function usePlanMoney() {
  const money = useMoney();
  const { locale } = useT();
  const usdText = (usd: number) => formatPrice(usd, locale);
  const local = money.planShowsLocal;
  return {
    local,
    /** Big figure for a USD price. */
    big: (usd: number) => (local ? money.formatPlan(usd, { approx: true }) : usdText(usd)),
    /** Small "US$19" reference next to a converted figure; null when not converted. */
    small: (usd: number) => (local ? `US${formatMoney(usd, { code: "USD", rate: 1, locale })}` : null),
    /** Monthly equivalent of a yearly price. */
    monthlyOf: (yearUsd: number) => {
      const m = Math.round(yearUsd / 12);
      return local ? money.formatPlan(m, { approx: true }) : usdText(m);
    },
    /** A savings amount (market rate, no buffer: never inflate a saving). */
    saving: (usd: number) => (local ? money.format(usd, { approx: true }) : usdText(usd)),
    /** USD visitor: false; unsupported currency: true. */
    billedInUsd: !local && money.code !== "USD",
  };
}

/** Big price + the small US$ reference. */
export function PlanPrice({
  usd,
  bigClassName,
  longBigClassName = bigClassName,
  smallClassName = "ml-1.5 whitespace-nowrap font-mono text-xs text-white/40",
}: {
  usd: number;
  bigClassName: string;
  /** Used when the figure is long (COP, CLP, JPY…) so it never overflows a phone card. */
  longBigClassName?: string;
  smallClassName?: string;
}) {
  const p = usePlanMoney();
  const small = p.small(usd);
  const big = p.big(usd);
  return (
    <>
      <span className={`whitespace-nowrap ${big.length > 7 ? longBigClassName : bigClassName}`}>{big}</span>
      {small && <span className={smallClassName}>{small}</span>}
    </>
  );
}

/** One line under a price: "approximate…" / "Billed in USD" / the existing note. */
export function PlanPriceNote({
  className,
  usdNoteKey,
}: {
  className: string;
  /** Message shown to USD visitors (the pre-existing wording), if any. */
  usdNoteKey?: string;
}) {
  const { t } = useT();
  const p = usePlanMoney();
  const text = p.local
    ? t("pricing.approxNote")
    : p.billedInUsd
      ? t("pricing.billedInUsd")
      : usdNoteKey
        ? t(usdNoteKey)
        : null;
  return text ? <p className={className}>{text}</p> : null;
}
