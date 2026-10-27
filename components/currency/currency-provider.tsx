"use client";

import { createContext, useContext, useMemo } from "react";
import { useT } from "@/components/i18n/locale-provider";
import type { Locale } from "@/lib/i18n/config";
import {
  formatMoney,
  formatPlanPrice,
  planShowsLocal,
  type CurrencyContext,
  type MoneyOpts,
} from "@/lib/currency/format";

const USD: CurrencyContext = { code: "USD", rate: 1, isConverted: false };

const Ctx = createContext<CurrencyContext>(USD);

/** Receives the already-resolved { code, rate, isConverted } — no fetching. */
export function CurrencyProvider({
  value,
  children,
}: {
  value: CurrencyContext;
  children: React.ReactNode;
}) {
  const stable = useMemo(() => value, [value.code, value.rate, value.isConverted]); // eslint-disable-line react-hooks/exhaustive-deps
  return <Ctx.Provider value={stable}>{children}</Ctx.Provider>;
}

export type Money = CurrencyContext & {
  locale: Locale;
  /** USD amount → visitor's currency (presentation only). */
  format: (usd: number, opts?: MoneyOpts) => string;
  /** Plan/unlock price: buffered + rounded up to a clean figure. */
  formatPlan: (usd: number, opts?: { approx?: boolean }) => string;
  /** false → show USD only ("Billed in USD"); true for USD itself is false too. */
  planShowsLocal: boolean;
};

export function useMoney(): Money {
  const ctx = useContext(Ctx);
  const { locale } = useT();
  return useMemo(() => {
    const m = { code: ctx.code, rate: ctx.rate, locale };
    return {
      ...ctx,
      locale,
      format: (usd, opts) => formatMoney(usd, m, opts),
      formatPlan: (usd, opts) => formatPlanPrice(usd, m, opts),
      planShowsLocal: planShowsLocal(m),
    };
  }, [ctx, locale]);
}
