/**
 * Owner-panel time windows in a FIXED zone (America/Guayaquil), never the
 * server's (Vercel = UTC). Guayaquil has no DST, so a local day is always
 * 24h and buckets are uniform — which is also what the SQL bucket function
 * (ov_bucket_counts) assumes.
 */

export const OWNER_TZ = "America/Guayaquil";

export type Range = "today" | "7d" | "30d" | "90d";
export const RANGES: Range[] = ["today", "7d", "30d", "90d"];

export type Bounds = {
  gte: number;
  lte: number;
  prevGte: number;
  prevLte: number;
  points: number;
  unit: "h" | "d";
  stepMs: number;
};

const HOUR = 3600000;
const DAY = 86400000;

function fmt(tz: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function localParts(ms: number, tz: string) {
  const p: Record<string, number> = {};
  for (const x of fmt(tz).formatToParts(new Date(ms))) {
    if (x.type !== "literal") p[x.type] = Number(x.value);
  }
  return p;
}

/** Epoch ms of 00:00 (in `tz`) of the day containing `ms`. */
export function startOfDay(ms: number, tz: string = OWNER_TZ): number {
  const p = localParts(ms, tz);
  const localAsUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  const offset = localAsUtc - Math.floor(ms / 1000) * 1000; // local − UTC
  return Date.UTC(p.year, p.month - 1, p.day) - offset;
}

/** "YYYY-MM-DD" of the local calendar day. */
export function guayaquilDay(ms: number, tz: string = OWNER_TZ): string {
  const p = localParts(ms, tz);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

export function rangeBounds(range: Range, now: number = Date.now(), tz: string = OWNER_TZ): Bounds {
  const today = startOfDay(now, tz);
  if (range === "today") {
    return { gte: today, lte: now, prevGte: today - DAY, prevLte: today, points: 24, unit: "h", stepMs: HOUR };
  }
  const len = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  const gte = today - (len - 1) * DAY;
  return { gte, lte: now, prevGte: gte - len * DAY, prevLte: gte, points: len, unit: "d", stepMs: DAY };
}

export function bucketIndex(tsMs: number, b: Bounds): number {
  return Math.max(0, Math.min(b.points - 1, Math.floor((tsMs - b.gte) / b.stepMs)));
}

export function bucketLabel(i: number, b: Bounds): string {
  if (b.unit === "h") return String(i).padStart(2, "0") + ":00";
  const back = b.points - 1 - i;
  return back === 0 ? "Hoy" : "-" + back + "d";
}
