import { fill } from "@/lib/i18n/lookup";
import type { ShareCtaPosition } from "@/lib/analytics/share-events";

/**
 * The locked views of the public audit page (brief 2026-10 §2.3), as plain data so the rule is testable:
 * each item is a NAME and a COUNT plus the plan that opens it — never paid content. The only audit-derived
 * input is the number of fixes; titles, steps and the persona are not even parameters here.
 *
 * Plan statements (verified in code, see components/share/share-blocks.tsx):
 *   fixes 2+ and the persona → $7 unlock (one audit), Pro, Scale;
 *   Meta ROAS scenarios      → Pro 1/month, Scale unlimited, $7 unlock = 1 projection for that audit;
 *   Library comparison       → a preview of 3 stores before upgrading (libraryFullMetricsCap), the whole Library on Pro/Scale.
 */
export interface LockedViewItem {
  position: ShareCtaPosition;
  title: string;
  plan: string;
}

/** `unlockOn` = the $7 unlock is live (REPORT_UNLOCK): the plan copy only mentions it then. */
export function lockedViewItems(t: (key: string) => string, fixCount: number, unlockOn = true): LockedViewItem[] {
  const k = (key: string) => t(unlockOn ? key : `${key}NoUnlock`);
  const items: LockedViewItem[] = [];
  if (fixCount > 0) {
    items.push({
      position: "locked_fixes",
      title: fixCount === 1 ? t("sharedPage.lockFixesOne") : fill(t("sharedPage.lockFixes"), { n: fixCount }),
      plan: k("sharedPage.lockFixesPlan"),
    });
  }
  items.push(
    { position: "locked_persona", title: t("sharedPage.lockPersona"), plan: k("sharedPage.lockPersonaPlan") },
    { position: "locked_scenarios", title: t("sharedPage.lockScenarios"), plan: k("sharedPage.lockScenariosPlan") },
    { position: "locked_library", title: t("sharedPage.lockLibrary"), plan: t("sharedPage.lockLibraryPlan") },
  );
  return items;
}
