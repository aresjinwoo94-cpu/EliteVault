import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/brand/logo";
import { getT } from "@/lib/i18n/server";

export default async function NotFound() {
  const { t } = await getT();
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
      <Logo size={32} />
      <p className="mt-10 font-mono text-xs uppercase tracking-widest text-white/40">
        {t("notFound.eyebrow")}
      </p>
      <h1 className="mt-3 font-serif text-6xl md:text-7xl tracking-tight">
        <span className="text-gold-gradient">{t("notFound.title")}</span>.
      </h1>
      <p className="mt-4 max-w-md text-sm text-white/55">
        {t("notFound.body")}
      </p>
      <Link href="/" className="mt-8">
        <Button size="lg">{t("notFound.cta")}</Button>
      </Link>
    </div>
  );
}
