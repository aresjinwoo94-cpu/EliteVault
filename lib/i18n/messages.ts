import type { Locale } from "./config";

/**
 * Translation dictionary.
 *
 * English is the source of truth and the fallback: `translator()` looks up a
 * dotted key in the active locale, then in English, then returns the key
 * itself. So a missing Spanish string degrades to English — never to a blank
 * or a crash. Add namespaces freely; only translate what you ship.
 */
type Dict = { [key: string]: string | Dict };

const en: Dict = {
  nav: {
    analyzer: "Analyzer",
    library: "Library",
    pricing: "Pricing",
    guides: "Guides",
    faq: "FAQ",
    about: "About",
    signIn: "Sign in",
    startFree: "Start free",
  },
  hero: {
    badge1: "AI CONVERSION AUDIT",
    badge2: "BUILT FOR ECOMMERCE FOUNDERS",
    line1: "Copy what's",
    line2: "actually",
    line3: "converting.",
    subPre: "EliteVault hunts down stores that are ",
    subHighlight: "already selling",
    subPost:
      ", breaks down exactly why they convert, and gives your store the same brutal audit a senior media buyer would — annotated screenshots, buyer-persona simulations and a 7-day Meta Ads scenario modeler.",
    ctaPrimary: "Audit my store free",
    ctaSecondary: "or see it in action first",
    urlPlaceholder: "yourstore.com",
    trust: "No credit card. 1 free analysis. Cancel anytime.",
  },
  footer: {
    tagline:
      "EliteVault — AI-powered audit & winning-site library for ecommerce founders.",
    pricing: "Pricing",
    faq: "FAQ",
    freeAudit: "Free audit",
    persona: "Persona simulator",
    metaAds: "Meta Ads forecast",
    blog: "Blog",
    about: "About",
    support: "Support",
    api: "API",
    signIn: "Sign in",
    privacy: "Privacy",
    terms: "Terms",
    refunds: "Refunds",
  },
  lang: {
    label: "Language",
    en: "English",
    es: "Español",
  },
};

const es: Dict = {
  nav: {
    analyzer: "Analizador",
    library: "Librería",
    pricing: "Precios",
    guides: "Guías",
    faq: "FAQ",
    about: "Nosotros",
    signIn: "Iniciar sesión",
    startFree: "Empezar gratis",
  },
  hero: {
    badge1: "AUDITORÍA DE CONVERSIÓN CON IA",
    badge2: "HECHO PARA FUNDADORES DE ECOMMERCE",
    line1: "Copia lo que",
    line2: "de verdad",
    line3: "convierte.",
    subPre: "EliteVault rastrea tiendas que ",
    subHighlight: "ya están vendiendo",
    subPost:
      ", desglosa exactamente por qué convierten y le da a tu tienda la misma auditoría brutal que haría un media buyer senior — capturas anotadas, simulaciones de buyer-persona y un modelador de campañas de Meta Ads a 7 días.",
    ctaPrimary: "Audita mi tienda gratis",
    ctaSecondary: "o míralo en acción primero",
    urlPlaceholder: "tutienda.com",
    trust: "Sin tarjeta. 1 análisis gratis. Cancela cuando quieras.",
  },
  footer: {
    tagline:
      "EliteVault — auditoría con IA y librería de tiendas ganadoras para fundadores de ecommerce.",
    pricing: "Precios",
    faq: "FAQ",
    freeAudit: "Auditoría gratis",
    persona: "Simulador de persona",
    metaAds: "Forecast de Meta Ads",
    blog: "Blog",
    about: "Nosotros",
    support: "Soporte",
    api: "API",
    signIn: "Iniciar sesión",
    privacy: "Privacidad",
    terms: "Términos",
    refunds: "Reembolsos",
  },
  lang: {
    label: "Idioma",
    en: "English",
    es: "Español",
  },
};

export const messages: Record<Locale, Dict> = { en, es };

/** Returns a `t(path)` lookup bound to a locale, with English fallback. */
export function translator(locale: Locale): (path: string) => string {
  const lookup = (dict: Dict, path: string): string | undefined => {
    let cur: string | Dict | undefined = dict;
    for (const key of path.split(".")) {
      if (typeof cur !== "object" || cur === null) return undefined;
      cur = cur[key];
      if (cur === undefined) return undefined;
    }
    return typeof cur === "string" ? cur : undefined;
  };
  return (path: string): string =>
    lookup(messages[locale], path) ?? lookup(messages.en, path) ?? path;
}
