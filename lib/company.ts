/**
 * Single source of truth for company + founder identity.
 *
 * Resolves gap #9 (identity inconsistency): every public surface — the About
 * page, the Organization JSON-LD, the landing founder note, the legal pages,
 * and emails — reads from HERE, so the identity is identical everywhere and
 * changes in one place.
 *
 * Values below are the REAL operating entity (Vital Living LLC, New Mexico)
 * and the real founder (Ariel Jiménez), provided by the owner. The brand
 * shown to users is "EliteVault".
 *
 * NOTE(verify): the X/Twitter handle was transcribed from a screenshot —
 * double-check it resolves to the real profile; fix here if not.
 */
export const COMPANY = {
  name: "EliteVault",
  tagline: "AI conversion audits for ecommerce founders",
  legalEntity: "Vital Living LLC",
  country: "New Mexico, United States",
  address: "8206 Louisiana Blvd NE, Ste A #7947, Albuquerque, NM 87113",
  contactEmail: "support@elitevaultapp.com",

  founder: {
    name: "Ariel Jiménez",
    role: "Founder, EliteVault",
    initials: "AJ",
  },

  // Verifiable profiles. Empty values are ignored (filtered out).
  socials: {
    tiktok: "https://www.tiktok.com/@elitevaultoff",
    instagram: "https://www.instagram.com/elite_vault_team",
    x: "https://x.com/ArielJimen27396", // verify exact handle
  },
};

/** Non-empty social profile URLs (for JSON-LD sameAs + the About page). */
export function socialUrls(): string[] {
  return Object.values(COMPANY.socials).filter(
    (v): v is string => typeof v === "string" && v.length > 0,
  );
}
