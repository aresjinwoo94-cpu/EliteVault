import type { Metadata } from "next";
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
