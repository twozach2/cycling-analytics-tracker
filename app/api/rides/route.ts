import { and, desc, eq } from "drizzle-orm";
import { getChatGPTUser } from "../../chatgpt-auth";
import { getDb } from "../../../db";
import { ftpHistory, powerDuration, rideMetrics, riders, rides, sourceFiles } from "../../../db/schema";
import { deriveRideMetrics, evaluateDecouplingEligibility, recommendRecovery } from "../../../lib/metrics";
import { ftpSnapshotForRide, type ActivityEnvironment, type WorkoutSubtype } from "../../../lib/strava-sync";

async function riderIdFor(request: Request) {
  const user = await getChatGPTUser();
  const hostname = new URL(request.url).hostname;
  return user?.userId ?? ((hostname === "localhost" || hostname === "127.0.0.1") ? "local-rider" : null);
}

export async function GET(request: Request) {
  const riderId = await riderIdFor(request);
  if (!riderId) return Response.json({ error: "Sign in to view saved rides." }, { status: 401 });

  const db = getDb();
  const rows = await db
    .select({ ride: rides, metrics: rideMetrics })
    .from(rides)
    .leftJoin(rideMetrics, eq(rideMetrics.rideId, rides.id))
    .where(eq(rides.riderId, riderId))
    .orderBy(desc(rides.startedAt))
    .limit(250);
  return Response.json({ rides: rows });
}

type RidePayload = {
  sourceFileId?: string;
  source?: "fit" | "tcx" | "gpx" | "manual";
  name?: string;
  startedAt?: string;
  distanceM?: number | null;
  movingTimeS?: number | null;
  elapsedTimeS?: number | null;
  elevationGainM?: number | null;
  averageHeartRateBpm?: number | null;
  maximumHeartRateBpm?: number | null;
  averageCadenceRpm?: number | null;
  maximumCadenceRpm?: number | null;
  averagePowerWatts?: number | null;
  maximumPowerWatts?: number | null;
  normalizedPowerWatts?: number | null;
  ftpAtRideWatts?: number | null;
  weightAtRideKg?: number | null;
  sourceTrainingLoad?: number | null;
  rideType?: "Zone 2" | "Zone 2 benchmark" | "Recovery" | "Tempo" | "Threshold" | "Free ride";
  routeName?: string | null;
  aerobicDecouplingPercent?: number | null;
  variabilityIndex?: number | null;
  cadenceStddev?: number | null;
  cadenceTargetPercent?: number | null;
  cadenceAcceptablePercent?: number | null;
  cadenceLowPercent?: number | null;
  cadenceHighPercent?: number | null;
  first15HeartRateBpm?: number | null;
  final15HeartRateBpm?: number | null;
  pairedSampleCount?: number;
  pairedCoveragePercent?: number;
  environment?: ActivityEnvironment;
  workoutSubtype?: WorkoutSubtype;
  powerDuration?: Array<{ durationSeconds: number; bestPowerWatts: number }>;
};

export async function POST(request: Request) {
  const riderId = await riderIdFor(request);
  if (!riderId) return Response.json({ error: "Sign in to save rides." }, { status: 401 });
  const payload = (await request.json()) as RidePayload;
  const name = payload.name?.trim();
  const startedAt = payload.startedAt && Number.isFinite(Date.parse(payload.startedAt)) ? payload.startedAt : null;
  if (!name || !startedAt) return Response.json({ error: "Ride name and start time are required." }, { status: 400 });

  const movingTimeS = Math.max(0, Math.round(payload.movingTimeS ?? 0));
  const elapsedTimeS = Math.max(movingTimeS, Math.round(payload.elapsedTimeS ?? movingTimeS));
  const db = getDb();
  const [[profile], ftpRows] = await Promise.all([
    db.select({ ftp: riders.defaultFtpWatts, weightKg: riders.defaultWeightKg }).from(riders).where(eq(riders.id, riderId)).limit(1),
    db.select({ effectiveAt: ftpHistory.effectiveAt, ftpWatts: ftpHistory.ftpWatts }).from(ftpHistory).where(eq(ftpHistory.riderId, riderId)).orderBy(desc(ftpHistory.effectiveAt)),
  ]);
  const ftpSnapshot = ftpSnapshotForRide({
    startedAt,
    history: ftpRows,
    currentFtpWatts: profile?.ftp ?? payload.ftpAtRideWatts ?? null,
  });
  const metrics = deriveRideMetrics({
    movingTimeSeconds: movingTimeS,
    averagePowerWatts: payload.averagePowerWatts ?? null,
    normalizedPowerWatts: payload.normalizedPowerWatts ?? null,
    averageHeartRateBpm: payload.averageHeartRateBpm ?? null,
    ftpWatts: ftpSnapshot.ftpWatts,
  });
  const trainingLoad = payload.sourceTrainingLoad ?? metrics.trainingLoad;
  const finalMetrics = { ...metrics, trainingLoad, trainingLoadIsEstimated: payload.sourceTrainingLoad == null && metrics.trainingLoadIsEstimated };
  const recovery = recommendRecovery(finalMetrics, movingTimeS, 0);

  if (payload.sourceFileId) {
    const [ownedFile] = await db
      .select({ id: sourceFiles.id })
      .from(sourceFiles)
      .where(and(eq(sourceFiles.id, payload.sourceFileId), eq(sourceFiles.riderId, riderId)))
      .limit(1);
    if (!ownedFile) return Response.json({ error: "The uploaded source file was not found." }, { status: 400 });

    const [existing] = await db
      .select({ rideId: rides.id, metrics: rideMetrics })
      .from(rides)
      .leftJoin(rideMetrics, eq(rideMetrics.rideId, rides.id))
      .where(and(eq(rides.riderId, riderId), eq(rides.sourceFileId, payload.sourceFileId)))
      .limit(1);
    if (existing) {
      return Response.json({ rideId: existing.rideId, metrics: existing.metrics, duplicate: true });
    }
  }

  const id = crypto.randomUUID();
  const allowedRideTypes = new Set(["Zone 2", "Zone 2 benchmark", "Recovery", "Tempo", "Threshold", "Free ride"]);
  const rideType = payload.rideType && allowedRideTypes.has(payload.rideType) ? payload.rideType : "Free ride";
  const environment: ActivityEnvironment = ["virtual", "indoor", "outdoor"].includes(payload.environment ?? "") ? payload.environment! : "outdoor";
  const workoutSubtype: WorkoutSubtype = payload.workoutSubtype === "trainer_workout" || payload.workoutSubtype === "race" ? payload.workoutSubtype : null;
  const stoppedPercent = elapsedTimeS > 0 ? Math.max(0, ((elapsedTimeS - movingTimeS) / elapsedTimeS) * 100) : null;
  const eligibility = evaluateDecouplingEligibility({
    movingTimeSeconds: movingTimeS,
    variabilityIndex: payload.variabilityIndex ?? null,
    stoppedPercent,
    pairedSampleCount: payload.pairedSampleCount ?? 0,
    pairedCoveragePercent: payload.pairedCoveragePercent ?? 0,
    aerobicDecouplingPercent: payload.aerobicDecouplingPercent ?? null,
    isIntervalWorkout: workoutSubtype === "trainer_workout" || rideType === "Threshold",
  });
  await db.insert(rides).values({
    id,
    riderId,
    sourceFileId: payload.sourceFileId,
    source: payload.source ?? "manual",
    name,
    startedAt,
    rideType,
    indoor: environment !== "outdoor",
    environment,
    workoutSubtype,
    routeName: payload.routeName?.trim() || null,
    distanceM: payload.distanceM,
    movingTimeS,
    elapsedTimeS,
    elevationGainM: payload.elevationGainM,
    averageHeartRateBpm: payload.averageHeartRateBpm,
    maximumHeartRateBpm: payload.maximumHeartRateBpm,
    averageCadenceRpm: payload.averageCadenceRpm,
    maximumCadenceRpm: payload.maximumCadenceRpm,
    averagePowerWatts: payload.averagePowerWatts,
    maximumPowerWatts: payload.maximumPowerWatts,
    normalizedPowerWatts: payload.normalizedPowerWatts,
    normalizedPowerSource: payload.normalizedPowerWatts == null ? "unavailable" : "recorded",
    ftpAtRideWatts: ftpSnapshot.ftpWatts,
    ftpSnapshotSource: ftpSnapshot.source,
    weightAtRideKg: profile?.weightKg ?? payload.weightAtRideKg,
  });
  await db.insert(rideMetrics).values({
    rideId: id,
    powerHeartRateRatio: finalMetrics.powerHeartRateRatio,
    powerToWeightRatio: payload.averagePowerWatts && payload.weightAtRideKg
      ? payload.averagePowerWatts / payload.weightAtRideKg
      : null,
    intensityFactor: finalMetrics.intensityFactor,
    intensityIsEstimated: finalMetrics.intensityIsEstimated,
    trainingLoad: finalMetrics.trainingLoad,
    trainingLoadIsEstimated: finalMetrics.trainingLoadIsEstimated,
    variabilityIndex: payload.variabilityIndex,
    aerobicDecouplingPercent: payload.aerobicDecouplingPercent,
    decouplingEligible: eligibility.eligible,
    decouplingEligibilityReason: eligibility.reason,
    stoppedPercent,
    cadenceStddev: payload.cadenceStddev,
    cadenceTargetPercent: payload.cadenceTargetPercent,
    cadenceAcceptablePercent: payload.cadenceAcceptablePercent,
    cadenceLowPercent: payload.cadenceLowPercent,
    cadenceHighPercent: payload.cadenceHighPercent,
    first15HeartRateBpm: payload.first15HeartRateBpm,
    final15HeartRateBpm: payload.final15HeartRateBpm,
    dataQuality: payload.normalizedPowerWatts == null ? "medium" : "high",
  });
  const durationRows = (payload.powerDuration ?? [])
    .filter((entry) => Number.isFinite(entry.durationSeconds) && entry.durationSeconds > 0 && Number.isFinite(entry.bestPowerWatts) && entry.bestPowerWatts > 0)
    .map((entry) => ({ rideId: id, durationSeconds: Math.round(entry.durationSeconds), bestPowerWatts: entry.bestPowerWatts }));
  if (durationRows.length) await db.insert(powerDuration).values(durationRows).onConflictDoNothing();

  return Response.json({ rideId: id, metrics: finalMetrics, recovery, duplicate: false }, { status: 201 });
}
