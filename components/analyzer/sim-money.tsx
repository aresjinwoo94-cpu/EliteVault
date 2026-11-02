"use client";

import { createContext, useContext, useMemo } from "react";
import { useT } from "@/components/i18n/locale-provider";
import { formatMoney, type MoneyOpts } from "@/lib/currency/format";
import { SIM_USD, type SimDisplay } from "@/lib/currency/sim";

/**
 * The currency one Meta simulation is SHOWN in: the one stored on its row
 * (display_currency / display_fx_rate), so a reload shows the same figures.
 * Without a provider (or a row from before the columns) it is USD, exactly as
 * before. The engine's numbers are always USD; only the display converts.
 */
const Ctx = createContext<SimDisplay>(SIM_USD);

export function SimMoneyProvider({ display, children }: { display: SimDisplay; children: React.ReactNode }) {
  const value = useMemo(() => display, [display.code, display.rate]); // eslint-disable-line react-hooks/exhaustive-deps
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSimMoney() {
  const d = useContext(Ctx);
  const { locale } = useT();
  return useMemo(() => {
    const ctx = { code: d.code, rate: d.rate, locale };
    return {
      code: d.code,
      rate: d.rate,
      /** A USD engine amount → the simulation's display currency. */
      fmt: (usd: number, kind: MoneyOpts["kind"] = "metric", compact = false) =>
        formatMoney(usd, ctx, { kind, compact }),
      /** A whole-dollar figure that may carry cents (AOV): cents only when it has them. */
      fmtAuto: (usd: number) =>
        formatMoney(usd, ctx, { kind: Number.isInteger(usd) ? "metric" : "small" }),
    };
  }, [d.code, d.rate, locale]);
}
