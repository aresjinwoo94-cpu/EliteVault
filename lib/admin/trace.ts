/** Pure helpers for the "Casi pagan" origin trace. */

export function originSummary(o: {
  channel?: string | null;
  referrer?: string | null;
  campaign?: string | null;
  landing?: string | null;
}): { known: boolean; text: string } {
  if (!o.channel) {
    return {
      known: false,
      text: "Sin rastro: cuenta creada antes de la atribución, o el visitante nunca fue vinculado (sin cookie ev_vid).",
    };
  }
  const parts = [`Llegó por ${o.channel}`];
  if (o.referrer && o.referrer !== "Directo") parts.push(`desde ${o.referrer}`);
  if (o.campaign) parts.push(`campaña «${o.campaign}»`);
  if (o.landing) parts.push(`aterrizó en ${o.landing}`);
  return { known: true, text: parts.join(" · ") };
}

export function authProviderLabel(p: string | null | undefined): string {
  if (!p) return "—";
  if (p === "google") return "Google";
  if (p === "email") return "Email (magic link)";
  return p;
}
