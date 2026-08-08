export type StravaSyncMode = "new" | "six_months";

const RECENT_OVERLAP_DAYS = 7;
export const AUTOMATIC_SYNC_INTERVAL_MS = 15 * 60 * 1000;

export function shouldRunAutomaticSync(lastSyncedAt: string | null, now = new Date()) {
  if (!lastSyncedAt) return true;
  const lastSyncMs = Date.parse(lastSyncedAt);
  return !Number.isFinite(lastSyncMs) || now.getTime() - lastSyncMs >= AUTOMATIC_SYNC_INTERVAL_MS;
}

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

export type ActivityEnvironment = "virtual" | "indoor" | "outdoor";
export type WorkoutSubtype = "trainer_workout" | "race" | null;
export type RideTrainingType = "Zone 2" | "Zone 2 benchmark" | "Recovery" | "Tempo" | "Threshold" | "Free ride";

export function classifyStravaActivity(activity: {
  sport_type?: string;
  type?: string;
  trainer?: boolean;
  workout_type?: number | null;
  name?: string;
}): { environment: ActivityEnvironment; indoor: boolean; workoutSubtype: WorkoutSubtype } {
  const sportType = (activity.sport_type ?? activity.type ?? "").toLowerCase();
  const virtual = sportType === "virtualride";
  const indoor = virtual || Boolean(activity.trainer);
  const workoutName = activity.name ?? "";
  const trainerWorkout = activity.workout_type === 11 || /\b(erg|workout|intervals?|ramp test)\b/i.test(workoutName);
  const workoutSubtype = trainerWorkout ? "trainer_workout" : activity.workout_type === 10 ? "race" : null;
  return { environment: virtual ? "virtual" : indoor ? "indoor" : "outdoor", indoor, workoutSubtype };
}

export function classifyStravaRideType(input: {
  name?: string;
  workoutSubtype: WorkoutSubtype;
  intensityFactor: number | null;
}): RideTrainingType {
  const name = input.name ?? "";
  if (/\b(zone ?2|z2|aerobic)\b.*\bbenchmark\b|\bbenchmark\b.*\b(zone ?2|z2|aerobic)\b/i.test(name)) return "Zone 2 benchmark";
  if (/\b(recovery|recover|easy spin|rest day)\b/i.test(name)) return "Recovery";
  if (/\b(zone ?2|z2|endurance|aerobic|base ride)\b/i.test(name)) return "Zone 2";
  if (/\b(tempo|sweet ?spot)\b/i.test(name)) return "Tempo";
  if (/\b(threshold|ftp|vo2|max intervals?|race)\b/i.test(name) || input.workoutSubtype === "race") return "Threshold";
  if (input.intensityFactor === null || !Number.isFinite(input.intensityFactor)) return "Free ride";
  if (input.intensityFactor < 0.55) return "Recovery";
  if (input.intensityFactor < 0.76) return "Zone 2";
  if (input.intensityFactor < 0.9) return "Tempo";
  return "Threshold";
}

export type FtpHistoryEntry = { effectiveAt: string; ftpWatts: number };

export function ftpSnapshotForRide(input: {
  startedAt: string;
  history: readonly FtpHistoryEntry[];
  currentFtpWatts: number | null;
  existingFtpWatts?: number | null;
  existingSource?: string | null;
}): { ftpWatts: number | null; source: string } {
  const rideTime = Date.parse(input.startedAt);
  const historyMatch = Number.isFinite(rideTime)
    ? input.history
      .filter((entry) => Number.isFinite(entry.ftpWatts) && entry.ftpWatts > 0 && Date.parse(entry.effectiveAt) <= rideTime)
      .sort((a, b) => Date.parse(b.effectiveAt) - Date.parse(a.effectiveAt))[0]
    : undefined;
  if (historyMatch) return { ftpWatts: historyMatch.ftpWatts, source: "ftp_history" };
  if (input.existingFtpWatts && input.existingFtpWatts > 0) {
    return { ftpWatts: input.existingFtpWatts, source: input.existingSource || "stored_snapshot" };
  }
  if (input.currentFtpWatts && input.currentFtpWatts > 0) {
    return { ftpWatts: input.currentFtpWatts, source: "current_at_import" };
  }
  return { ftpWatts: null, source: "unavailable" };
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
