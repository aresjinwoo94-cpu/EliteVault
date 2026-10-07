/**
 * Single country-label helper for the owner panel: flag from the ISO code +
 * Spanish name from Intl (every country, incl. Ecuador). Replaces the three
 * hand-written COUNTRY maps.
 */

const names = (() => {
  try {
    return new Intl.DisplayNames(["es"], { type: "region" });
  } catch {
    return null;
  }
})();

const isIso2 = (cc: string) => /^[A-Z]{2}$/.test(cc);

export function flagEmoji(cc: string): string {
  const c = cc.toUpperCase();
  if (!isIso2(c)) return "🌐";
  return String.fromCodePoint(...[...c].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65));
}

export function countryLabel(cc?: string | null): string {
  const c = (cc || "").trim().toUpperCase();
  if (!isIso2(c) || c === "XX" || c === "ZZ") return "🌐 Desconocido";
  let name = c;
  try {
    name = names?.of(c) || c;
  } catch {
    /* keep the code */
  }
  return `${flagEmoji(c)} ${name}`;
}
