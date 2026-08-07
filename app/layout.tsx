import type { Metadata, Viewport } from "next";
import { fontsVariables } from "@/lib/fonts";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { AnalyticsGate } from "@/components/analytics/analytics-gate";
import { PageTracker } from "@/components/analytics/page-tracker";
import { isInternalRequest } from "@/lib/analytics/is-internal";
import { SupportChat } from "@/components/support/support-chat";
import { socialUrls } from "@/lib/company";
import { getLocale } from "@/lib/i18n/server";
import { LocaleProvider } from "@/components/i18n/locale-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    // Brief §4.2 — clarity over cleverness for the site-wide default title.
    default: "EliteVault — Free AI store audit before you run Meta ads",
    template: "%s · EliteVault",
  },
  description:
    "Test your store like a senior media buyer before you spend on Meta ads. Free AI audit with an annotated screenshot, buyer-persona reaction and a 7-day Meta Ads scenario modeler.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
  applicationName: "EliteVault",
  keywords: [
    "ecommerce audit",
    "conversion rate optimization",
    "CRO",
    "Shopify audit",
    "Meta Ads optimization",
    "DTC marketing",
    "ecommerce analyzer",
    "buyer persona simulation",
    "winning ecommerce stores",
    "media buying tool",
  ],
  authors: [{ name: "EliteVault" }],
  creator: "EliteVault",
  publisher: "EliteVault",
  // Tells crawlers to index everything by default (per-route metadata
  // can override). Without this Vercel preview URLs sometimes get a
  // restrictive default.
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  // NOTE: no default `alternates.canonical` here. A root-layout default of "/"
  // silently mis-canonicalized every page that forgot to set its own (e.g.
  // /about pointed its canonical at the homepage), telling Google those pages
  // were duplicates of the home and shouldn't be indexed separately. Canonicals
  // are now set PER PAGE, self-referentially. `metadataBase` (above) still
  // resolves those relative canonicals to the correct absolute domain.
  openGraph: {
    title: "EliteVault — Free AI store audit before you run Meta ads",
    description:
      "Test your store like a senior media buyer before you spend on Meta: a free AI conversion audit, a library of winning ecommerce stores, and a 7-day Meta Ads scenario modeler.",
    type: "website",
    locale: "en_US",
    siteName: "EliteVault",
    // Next.js auto-detects app/opengraph-image.tsx and injects the right
    // og:image URL. Listing it here as a comment for grep-ability.
    // images: ["/opengraph-image"],
  },
  twitter: {
    card: "summary_large_image",
    title: "EliteVault — Free AI store audit before you run Meta ads",
    description:
      "Test your store like a senior media buyer before you spend on Meta ads: free AI audit + a library of winning stores + a 7-day Meta Ads scenario modeler.",
    // Same — app/twitter-image.tsx is auto-detected.
  },
  // Explicit icons declaration. Next.js App Router also auto-detects
  // app/icon.svg, but declaring it here is belt-and-suspenders: removes
  // any ambiguity about which file is the favicon, future-proofs against
  // convention changes, and lets us add multiple sizes/formats later.
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    shortcut: "/icon.svg",
    apple: "/icon.svg", // iOS Safari uses SVG when no apple-icon.png exists
  },
  category: "technology",
};

// Mobile browser chrome color — matches our obsidian dark background so
// the URL bar / status bar tints to the brand rather than the OS default.
// Lives in viewport export per Next 14+ convention (was metadata.themeColor
// in older versions; that's deprecated but still works).
export const viewport: Viewport = {
  themeColor: "#0A0A0F",
  colorScheme: "dark",
};

// Organization-level JSON-LD structured data — appears on every page so
// Google can build a "Knowledge Panel" / sitelinks for the brand. The
// SoftwareApplication schema (per-page on the landing) lives in app/page.tsx.
const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "EliteVault",
  url: process.env.NEXT_PUBLIC_APP_URL ?? "https://elitevaultapp.com",
  logo: `${process.env.NEXT_PUBLIC_APP_URL ?? "https://elitevaultapp.com"}/icon.svg`,
  description:
    "AI-powered ecommerce audit, library of winning stores, and Meta Ads scenario modeler for DTC founders and media buyers.",
  // Social profiles come from the single identity source (lib/company.ts).
  // Empty until real URLs are set there — Google ignores an empty array.
  sameAs: socialUrls(),
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Server-side check: if the current request is from the developer
  // (email in INTERNAL_EMAILS env), the gate suppresses ALL analytics
  // and sets a localStorage flag that persists even after logout.
  const isInternal = await isInternalRequest();
  const locale = await getLocale();

  return (
    <html lang={locale} className={`${fontsVariables} dark`} suppressHydrationWarning>
      <body className="font-sans antialiased min-h-screen">
        {/* Structured data — Google parses this to understand the brand */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(organizationJsonLd),
          }}
        />
        {/*
          Analytics gate — wraps Vercel Analytics + Speed Insights +
          PostHog. Honors INTERNAL_EMAILS (server) and the
          `__ev_no_analytics` localStorage flag (client) so developer
          activity never inflates the funnel.
        */}
        {/* Analítica first-party del panel del dueño (registra visitas en page_views).
            Respeta el mismo opt-out interno que AnalyticsGate. */}
        <PageTracker isInternal={isInternal} />
        <LocaleProvider locale={locale}>
          <AnalyticsGate isInternal={isInternal}>
            <TooltipProvider delayDuration={150}>
              {children}
              <Toaster />
            </TooltipProvider>
          </AnalyticsGate>
        </LocaleProvider>
        {/* Floating support chatbot — grounded strictly in lib/support/kb.ts;
            always offers "talk to a human" → /support/contact. */}
        <SupportChat />
      </body>
    </html>
  );
}
