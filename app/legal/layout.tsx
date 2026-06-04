import type { ReactNode } from "react";
import { MarketingNav } from "@/components/marketing/nav";
import { Footer } from "@/components/marketing/footer";

/**
 * Shared chrome for the public legal/policy pages (privacy, terms, refunds).
 * Lives at app/legal/* — OUTSIDE the (app) route group — so middleware does
 * not gate it behind auth. Reuses the marketing nav + footer for consistency.
 */
export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <MarketingNav />
      <main className="flex-1">
        <div className="container max-w-3xl py-24 md:py-32">{children}</div>
      </main>
      <Footer />
    </div>
  );
}
