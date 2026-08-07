export type StravaSyncMode = "new" | "six_months";

const RECENT_OVERLAP_DAYS = 7;

const cyclingTypes = new Set([
  "ride",
  "virtualride",
  "mountainbikeride",
  "gravelride",
  "ebikeride",
  "emountainbikeride",
  "handcycle",
  "velomobile",
]);

export function isCyclingActivity(activity: { sport_type?: string; type?: string }) {
  return cyclingTypes.has((activity.sport_type ?? activity.type ?? "").toLowerCase());
}

export function sixMonthsBefore(date: Date) {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() - 6;
  const targetYear = year + Math.floor(month / 12);
  const targetMonth = ((month % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  return new Date(Date.UTC(
    targetYear,
    targetMonth,
    Math.min(date.getUTCDate(), lastDay),
    date.getUTCHours(),
    date.getUTCMinutes(),
    date.getUTCSeconds(),
  ));
}

export function syncAfterEpoch(mode: StravaSyncMode, now: Date, lastSyncedAt: string | null) {
  if (mode === "six_months" || !lastSyncedAt) {
    return Math.floor(sixMonthsBefore(now).getTime() / 1000);
  }

  const lastSyncMs = Date.parse(lastSyncedAt);
  if (!Number.isFinite(lastSyncMs)) return Math.floor(sixMonthsBefore(now).getTime() / 1000);
  return Math.floor((lastSyncMs - (RECENT_OVERLAP_DAYS * 24 * 60 * 60 * 1000)) / 1000);
}

export function parseReadBudget(headers: Headers, defaultBudget = 40) {
  const limits = headers.get("x-readratelimit-limit")?.split(",").map(Number);
  const usage = headers.get("x-readratelimit-usage")?.split(",").map(Number);
  if (!limits?.length || !usage?.length || !Number.isFinite(limits[0]) || !Number.isFinite(usage[0])) {
    return defaultBudget;
  }
  return Math.max(0, Math.min(defaultBudget, limits[0] - usage[0] - 5));
}
