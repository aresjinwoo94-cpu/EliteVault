import {
  Blocks,
  CreditCard,
  Compass,
  Globe,
  KeyRound,
  Library,
  Scan,
  Settings,
  TrendingUp,
} from "lucide-react";

export type NavItem = {
  key: string;
  href: string;
  icon: typeof Compass;
  highlight?: boolean;
  scaleOnly?: boolean;
  /**
   * Hidden unless the Liquid Blocks flag is on. Both nav surfaces are client
   * components, so the flag can't be read here — the server layout resolves it
   * once and hands the answer down. See visibleNav below.
   */
  liquidOnly?: boolean;
};

/**
 * Single source of truth for the app-shell navigation. Consumed by both the
 * desktop sidebar (`sidebar.tsx`) and the mobile drawer (`mobile-nav.tsx`) so
 * the two never drift apart.
 */
export const BASE_NAV: NavItem[] = [
  { key: "sidebar.navOverview", href: "/app", icon: Compass },
  { key: "sidebar.navAnalyzer", href: "/app/analyzer", icon: Scan, highlight: true },
  // Liquid Blocks is its own tool, not a step of the audit — it sits beside the
  // Analyzer rather than under it, which is also why it has no plan gate here
  // (the preview is free; the charge is at export, see WP-D).
  { key: "sidebar.navLiquid", href: "/app/liquid", icon: Blocks, liquidOnly: true },
  { key: "sidebar.navTrends", href: "/app/trends", icon: TrendingUp },
  { key: "sidebar.navLibrary", href: "/app/library", icon: Library },
  { key: "sidebar.navCommunity", href: "/app/community", icon: Globe },
  { key: "sidebar.navApiKeys", href: "/app/settings/api-keys", icon: KeyRound, scaleOnly: true },
  { key: "sidebar.navBilling", href: "/app/billing", icon: CreditCard },
  { key: "sidebar.navSettings", href: "/app/settings", icon: Settings },
];

/**
 * The nav a given user should see. One place, so the desktop sidebar and the
 * mobile drawer can't drift on which items are gated — the reason BASE_NAV was
 * centralised in the first place.
 */
export function visibleNav(opts: {
  isScale: boolean;
  liquidEnabled: boolean;
}): NavItem[] {
  return BASE_NAV.filter(
    (item) =>
      (!item.scaleOnly || opts.isScale) &&
      (!item.liquidOnly || opts.liquidEnabled),
  );
}

// Settings should NOT match nested /app/settings/api-keys — require exact
// match for /app and /app/settings, prefix for the rest.
const EXACT_MATCH_ROUTES = new Set(["/app", "/app/settings"]);

export function isNavItemActive(href: string, path: string | null): boolean {
  return EXACT_MATCH_ROUTES.has(href)
    ? path === href
    : Boolean(path?.startsWith(href));
}
