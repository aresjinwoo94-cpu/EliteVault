import type { Metadata, Viewport } from "next";
import { fontsVariables } from "@/lib/fonts";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "EliteVault — Copy what actually converts",
    template: "%s · EliteVault",
  },
  description:
    "Find and copy exactly what stores already crushing it are doing. An AI-powered audit, a curated library of winning ecommerce sites, and a Meta-Ads-grade conversion analyzer.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
  openGraph: {
    title: "EliteVault — Copy what actually converts",
    description:
      "AI-powered audit, library of winning ecommerce stores, and a conversion analyzer that thinks like a top media buyer.",
    type: "website",
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
};

// Mobile browser chrome color — matches our obsidian dark background so
// the URL bar / status bar tints to the brand rather than the OS default.
// Lives in viewport export per Next 14+ convention (was metadata.themeColor
// in older versions; that's deprecated but still works).
export const viewport: Viewport = {
  themeColor: "#0A0A0F",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${fontsVariables} dark`} suppressHydrationWarning>
      <body className="font-sans antialiased min-h-screen">
        <TooltipProvider delayDuration={150}>
          {children}
          <Toaster />
        </TooltipProvider>
      </body>
    </html>
  );
}
