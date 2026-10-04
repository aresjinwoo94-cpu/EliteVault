"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/components/i18n/locale-provider";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t } = useT();
  useEffect(() => {
    console.error("[app error]", error);
  }, [error]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
      <AlertTriangle className="size-8 text-destructive" />
      <h1 className="mt-6 font-serif text-4xl tracking-tight">
        {t("errorPage.title")}
      </h1>
      <p className="mt-3 max-w-md text-sm text-white/55">
        {t("errorPage.body")}
      </p>
      {error.digest && (
        <p className="mt-2 text-xs font-mono text-white/30">{error.digest}</p>
      )}
      <Button onClick={reset} className="mt-8">
        {t("errorPage.retry")}
      </Button>
    </div>
  );
}
