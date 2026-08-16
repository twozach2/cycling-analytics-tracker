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
export type RideTrainingType =
  | "Zone 2"
  | "Zone 2 benchmark"
  | "Recovery"
  | "Tempo"
  | "Sweet Spot"
  | "Threshold"
  | "VO2"
  | "Sprint"
  | "FTP Test"
  | "Free ride";
export type RideContext = "ordinary" | "benchmark" | "structured_workout" | "race" | "group_ride";
export type ClassificationConfidence = "low" | "moderate" | "high";
export const RIDE_CLASSIFICATION_VERSION = "ride-classification-v2";

export type RideClassification = {
  trainingType: RideTrainingType;
  context: RideContext;
  confidence: ClassificationConfidence;
  reason: string;
  version: typeof RIDE_CLASSIFICATION_VERSION;
};

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

export function classifyRide(input: {
  name?: string;
  workoutSubtype: WorkoutSubtype;
  intensityFactor: number | null;
  movingTimeSeconds?: number | null;
  variabilityIndex?: number | null;
}): RideClassification {
  const name = input.name?.trim() ?? "";
  const benchmarkName = /\b(zone ?2|z2|aerobic)\b.*\bbenchmark\b|\bbenchmark\b.*\b(zone ?2|z2|aerobic)\b/i.test(name);
  const context: RideContext = benchmarkName
    ? "benchmark"
    : input.workoutSubtype === "race" || /\b(race|racing|crit|criterium)\b/i.test(name)
      ? "race"
      : /\b(group ride|pacer group|pace partner|social ride|club ride)\b/i.test(name)
        ? "group_ride"
        : input.workoutSubtype === "trainer_workout" || /\b(erg|workout|intervals?|training session|sweet ?spot|threshold|ftp test|ramp test|vo2|max aerobic|sprint|over unders?)\b|\b\d+\s*x\s*\d+\b/i.test(name)
          ? "structured_workout"
          : "ordinary";
  const result = (
    trainingType: RideTrainingType,
    confidence: ClassificationConfidence,
    reason: string,
  ): RideClassification => ({
    trainingType,
    context,
    confidence,
    reason: `${reason} Context: ${context.replaceAll("_", " ")}.`,
    version: RIDE_CLASSIFICATION_VERSION,
  });

  if (benchmarkName) return result("Zone 2", "high", "The activity name explicitly identifies a controlled Zone 2 benchmark.");
  if (/\b(ftp test|ramp test|20 minute test|twenty minute test)\b/i.test(name)) {
    return result("FTP Test", "high", "The activity name explicitly identifies an FTP assessment.");
  }
  if (/\b(vo2|max aerobic|vo2max)\b/i.test(name)) {
    return result("VO2", "high", "The activity name explicitly identifies VO2-focused work.");
  }
  if (/\b(sprint|anaerobic|neuromuscular)\b/i.test(name)) {
    return result("Sprint", "high", "The activity name explicitly identifies sprint or anaerobic work.");
  }
  if (/\b(recovery|recover|easy spin|rest day)\b/i.test(name)) {
    return result("Recovery", "high", "The activity name explicitly identifies recovery work.");
  }
  if (/\b(zone ?2|z2|endurance|aerobic|base ride)\b/i.test(name)) {
    return result("Zone 2", "high", "The activity name explicitly identifies endurance or Zone 2 work.");
  }
  if (/\b(sweet ?spot)\b/i.test(name)) {
    return result("Sweet Spot", "high", "The activity name explicitly identifies Sweet Spot work.");
  }
  if (/\b(tempo)\b/i.test(name)) {
    return result("Tempo", "high", "The activity name explicitly identifies tempo work.");
  }
  if (/\b(threshold|ftp intervals?|over unders?)\b/i.test(name)) {
    return result("Threshold", "high", "The activity name explicitly identifies threshold work.");
  }

  const intensityFactor = input.intensityFactor;
  if (intensityFactor === null || !Number.isFinite(intensityFactor)) {
    return result("Free ride", "low", "No explicit training intent or trustworthy power-based intensity was available.");
  }
  const variability = input.variabilityIndex;
  const confidence: ClassificationConfidence = variability !== null && variability !== undefined && Number.isFinite(variability) && variability > 1.15 ? "low" : "moderate";
  const durationMinutes = input.movingTimeSeconds && input.movingTimeSeconds > 0 ? Math.round(input.movingTimeSeconds / 60) : null;
  const evidence = `Stored FTP produced IF ${intensityFactor.toFixed(2)}${durationMinutes ? ` across ${durationMinutes} minutes` : ""}${variability !== null && variability !== undefined && Number.isFinite(variability) ? ` with VI ${variability.toFixed(2)}` : ""}.`;
  if (intensityFactor < 0.55) return result("Recovery", confidence, `${evidence} This falls in the conservative recovery band.`);
  if (intensityFactor < 0.76) return result("Zone 2", confidence, `${evidence} This falls in the endurance band.`);
  if (intensityFactor < 0.88) return result("Tempo", confidence, `${evidence} This falls in the tempo band.`);
  if (intensityFactor < 0.95) return result("Sweet Spot", confidence, `${evidence} This falls in the Sweet Spot band.`);
  return result("Threshold", confidence, `${evidence} This supports threshold-level load, but VO2 or sprint labels require explicit workout evidence.`);
}

export function classifyStravaRideType(input: {
  name?: string;
  workoutSubtype: WorkoutSubtype;
  intensityFactor: number | null;
  movingTimeSeconds?: number | null;
  variabilityIndex?: number | null;
}): RideTrainingType {
  return classifyRide(input).trainingType;
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
