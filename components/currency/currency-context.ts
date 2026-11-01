"use client";

import { createContext, useContext } from "react";
import type { CurrencyContext } from "@/lib/currency/format";

/** Raw context, in its own file so locale-provider and currency-provider can both use it. */
export const CurrencyCtx = createContext<CurrencyContext>({ code: "USD", rate: 1, isConverted: false });

export function useCurrencyContext(): CurrencyContext {
  return useContext(CurrencyCtx);
}
