import {
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
};

/**
 * Single source of truth for the app-shell navigation. Consumed by both the
 * desktop sidebar (`sidebar.tsx`) and the mobile drawer (`mobile-nav.tsx`) so
 * the two never drift apart.
 */
export const BASE_NAV: NavItem[] = [
  { key: "sidebar.navOverview", href: "/app", icon: Compass },
  { key: "sidebar.navAnalyzer", href: "/app/analyzer", icon: Scan, highlight: true },
  { key: "sidebar.navTrends", href: "/app/trends", icon: TrendingUp },
  { key: "sidebar.navLibrary", href: "/app/library", icon: Library },
  { key: "sidebar.navCommunity", href: "/app/community", icon: Globe },
  { key: "sidebar.navApiKeys", href: "/app/settings/api-keys", icon: KeyRound, scaleOnly: true },
  { key: "sidebar.navBilling", href: "/app/billing", icon: CreditCard },
  { key: "sidebar.navSettings", href: "/app/settings", icon: Settings },
];

// Settings should NOT match nested /app/settings/api-keys — require exact
// match for /app and /app/settings, prefix for the rest.
const EXACT_MATCH_ROUTES = new Set(["/app", "/app/settings"]);

export function isNavItemActive(href: string, path: string | null): boolean {
  return EXACT_MATCH_ROUTES.has(href)
    ? path === href
    : Boolean(path?.startsWith(href));
}
