"use client";

import { useCallback } from "react";
import { useT } from "@/components/i18n/locale-provider";
import { useMoney } from "@/components/currency/currency-provider";
import { formatBand } from "@/lib/currency/band";
import type { BandUsd } from "@/lib/growth-map/ranks";

/** `(bandUsd, legacy) => label` in the visitor's currency (legacy text for USD). */
export function useBandLabel(): (band: BandUsd, legacy: string) => string {
  const { t } = useT();
  const { code, rate, locale } = useMoney();
  const perMonth = t("report.bandPerMonth");
  const firstSales = t("report.bandFirstSales");
  return useCallback(
    (band, legacy) => formatBand(band, legacy, { code, rate, locale }, { perMonth, firstSales }),
    [code, rate, locale, perMonth, firstSales],
  );
}
