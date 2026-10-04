import { clientMessages } from "@/lib/i18n/messages";
import { getLocale } from "@/lib/i18n/server";
import { LocaleScope } from "@/components/i18n/locale-provider";

/**
 * Mounts the `app` dictionary scope (see lib/i18n/client-namespaces.ts) for the
 * signed-in app and the public report routes. Server Component: it resolves the
 * locale and hands the already-picked, single-language dictionary down.
 */
export async function AppScope({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <LocaleScope messages={clientMessages(locale, "app")}>{children}</LocaleScope>
  );
}
