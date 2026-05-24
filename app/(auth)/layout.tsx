import Link from "next/link";
import { Logo } from "@/components/brand/logo";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* ambient orbs */}
      <div className="pointer-events-none absolute -top-32 left-1/2 -translate-x-1/2 size-[600px] rounded-full bg-violet-700/20 blur-[120px]" />
      <div className="pointer-events-none absolute bottom-0 right-0 size-[500px] rounded-full bg-champagne-400/10 blur-[140px]" />

      <header className="relative z-10 flex items-center justify-between px-6 py-5 md:px-10">
        <Link href="/" aria-label="EliteVault home">
          <Logo />
        </Link>
        <Link
          href="/"
          className="text-sm text-white/40 hover:text-white/80 transition-colors"
        >
          ← Back to home
        </Link>
      </header>

      <main className="relative z-10 flex min-h-[calc(100vh-80px)] items-center justify-center px-6 pb-12">
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}
