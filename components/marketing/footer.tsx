import Link from "next/link";
import { Logo } from "@/components/brand/logo";

export function Footer() {
  return (
    <footer className="border-t border-white/[0.04] py-12">
      <div className="container max-w-6xl">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div>
            <Logo />
            <p className="mt-3 text-xs text-white/40 max-w-sm">
              EliteVault — AI-powered audit & winning-site library for ecommerce
              founders. © {new Date().getFullYear()}
            </p>
          </div>
          <nav className="grid grid-cols-2 md:flex gap-x-8 gap-y-2 text-sm text-white/50">
            <Link href="/#pricing" className="hover:text-white">
              Pricing
            </Link>
            <Link href="/#faq" className="hover:text-white">
              FAQ
            </Link>
            <Link href="/about" className="hover:text-white">
              About
            </Link>
            <Link href="/sign-in" className="hover:text-white">
              Sign in
            </Link>
            <Link href="/legal/privacy" className="hover:text-white">
              Privacy
            </Link>
            <Link href="/legal/terms" className="hover:text-white">
              Terms
            </Link>
            <Link href="/legal/refunds" className="hover:text-white">
              Refunds
            </Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}
