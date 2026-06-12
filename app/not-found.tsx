import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/brand/logo";

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
      <Logo size={32} />
      <p className="mt-10 font-mono text-xs uppercase tracking-widest text-white/40">
        Error 404
      </p>
      <h1 className="mt-3 font-serif text-6xl md:text-7xl tracking-tight">
        <span className="text-gold-gradient">Misplaced</span>.
      </h1>
      <p className="mt-4 max-w-md text-sm text-white/55">
        The page you're looking for has been moved, deleted, or never existed.
        Sometimes that happens. Let's get you back home.
      </p>
      <Link href="/" className="mt-8">
        <Button size="lg">Take me home</Button>
      </Link>
    </div>
  );
}
