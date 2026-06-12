import Link from "next/link";
import { Logo } from "@/components/brand/logo";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Ambient orbs — softer, more spread for premium feel */}
      <div className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 size-[700px] rounded-full bg-signal-700/15 blur-[140px]" />
      <div className="pointer-events-none absolute -bottom-32 -right-32 size-[600px] rounded-full bg-champagne-400/10 blur-[160px]" />

      <header className="relative z-10 flex items-center justify-between px-6 py-6 md:px-10 md:py-7">
        <Link href="/" aria-label="EliteVault home" className="transition-opacity hover:opacity-80">
          <Logo />
        </Link>
        <Link
          href="/"
          className="text-sm text-white/40 hover:text-white/80 transition-colors"
        >
          ← Back to home
        </Link>
      </header>

      {/*
        Auth form container — sits centered with generous vertical space.
        max-w-md keeps form rows from stretching too wide on desktop.
        pb-16 gives the form room to breathe above the bottom edge.
      */}
      <main className="relative z-10 flex min-h-[calc(100vh-88px)] items-center justify-center px-6 pb-16 pt-4">
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}
