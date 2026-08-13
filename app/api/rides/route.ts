import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { activityStreams, ftpHistory, powerDuration, rideMetrics, riders, rides, sourceFiles } from "../../../db/schema";
import { currentRider } from "../../../lib/current-rider";
import type { HeartRateZoneDistribution } from "../../../lib/heart-rate";
import { deriveRideMetrics, evaluateDecouplingEligibility, recommendRecovery } from "../../../lib/metrics";
import { classifyRide, ftpSnapshotForRide, type ActivityEnvironment, type RideContext, type RideTrainingType, type WorkoutSubtype } from "../../../lib/strava-sync";
import { countStravaStreamRecords, normalizeStreamRecordCounts, type StreamRecordCounts } from "../../../lib/stream-counts";
import { getFileStore } from "../../../server/platform/file-store";

const allowedRideTypes = new Set<RideTrainingType>(["Zone 2", "Zone 2 benchmark", "Recovery", "Tempo", "Sweet Spot", "Threshold", "VO2", "Sprint", "FTP Test", "Free ride"]);
const allowedRideContexts = new Set<RideContext>(["ordinary", "benchmark", "structured_workout", "race", "group_ride"]);

async function riderIdFor(request: Request) {
  return (await currentRider(request)).id;
}

export async function GET(request: Request) {
  const riderId = await riderIdFor(request);
  if (!riderId) return Response.json({ error: "Sign in to view saved rides." }, { status: 401 });

  const db = getDb();
  const rows = await db
    .select({ ride: rides, metrics: rideMetrics, stream: activityStreams, sourceFile: sourceFiles })
    .from(rides)
    .leftJoin(rideMetrics, eq(rideMetrics.rideId, rides.id))
    .leftJoin(activityStreams, eq(activityStreams.rideId, rides.id))
    .leftJoin(sourceFiles, eq(sourceFiles.id, rides.sourceFileId))
    .where(eq(rides.riderId, riderId))
    .orderBy(desc(rides.startedAt))
    .limit(250);
  const fileStore = getFileStore();
  const enrichedRows = await Promise.all(rows.map(async (row) => {
    if (!row.stream || row.stream.encoding !== "json" || row.stream.streamSampleCountsJson !== "{}") return row;
    try {
      const stored = await fileStore.get(row.stream.r2Key);
      if (!stored) return row;
      const streams = JSON.parse(await stored.text()) as Record<string, { data?: unknown[] } | undefined>;
      const countsJson = JSON.stringify(countStravaStreamRecords(streams));
      await db.update(activityStreams).set({ streamSampleCountsJson: countsJson }).where(eq(activityStreams.rideId, row.ride.id));
      return { ...row, stream: { ...row.stream, streamSampleCountsJson: countsJson } };
    } catch {
      return row;
    }
  }));
  return Response.json({ rides: enrichedRows });
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
  normalizedPowerSource?: "recorded" | "computed" | "unavailable";
  ftpAtRideWatts?: number | null;
  weightAtRideKg?: number | null;
  sourceTrainingLoad?: number | null;
  rideContext?: RideContext;
  rideType?: RideTrainingType;
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
  heartRateZones?: HeartRateZoneDistribution | null;
  pairedSampleCount?: number;
  pairedCoveragePercent?: number;
  environment?: ActivityEnvironment;
  sampleCount?: number;
  availableStreams?: string[];
  streamSampleCounts?: StreamRecordCounts;
  workoutSubtype?: WorkoutSubtype;
  powerDuration?: Array<{ durationSeconds: number; bestPowerWatts: number }>;
};

function heartRateZoneValues(distribution: HeartRateZoneDistribution | null | undefined) {
  return {
    heartRateThresholdBpm: distribution?.thresholdBpm ?? null,
    heartRateSampleCount: distribution?.sampleCount ?? 0,
    heartRateZone1Percent: distribution?.zone1Percent ?? null,
    heartRateZone2Percent: distribution?.zone2Percent ?? null,
    heartRateZone3Percent: distribution?.zone3Percent ?? null,
    heartRateZone4Percent: distribution?.zone4Percent ?? null,
    heartRateZone5Percent: distribution?.zone5Percent ?? null,
  };
}

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
  const heartRateZones = heartRateZoneValues(payload.heartRateZones);

  const legacyBenchmark = payload.rideType === "Zone 2 benchmark";
  const rideType = legacyBenchmark ? "Zone 2" : payload.rideType && allowedRideTypes.has(payload.rideType) ? payload.rideType : "Free ride";
  const rideContext = payload.rideContext && allowedRideContexts.has(payload.rideContext) ? payload.rideContext : legacyBenchmark ? "benchmark" : "ordinary";
  const environment: ActivityEnvironment = ["virtual", "indoor", "outdoor"].includes(payload.environment ?? "") ? payload.environment! : "outdoor";
  const workoutSubtype: WorkoutSubtype = payload.workoutSubtype === "trainer_workout" || payload.workoutSubtype === "race" ? payload.workoutSubtype : null;
  const stoppedPercent = elapsedTimeS > 0 ? Math.max(0, ((elapsedTimeS - movingTimeS) / elapsedTimeS) * 100) : null;
  const normalizedPowerSource = payload.normalizedPowerWatts == null
    ? "unavailable" as const
    : payload.normalizedPowerSource === "computed"
      ? "computed" as const
      : "recorded" as const;
  const eligibility = evaluateDecouplingEligibility({
    movingTimeSeconds: movingTimeS,
    variabilityIndex: payload.variabilityIndex ?? null,
    stoppedPercent,
    pairedSampleCount: payload.pairedSampleCount ?? 0,
    pairedCoveragePercent: payload.pairedCoveragePercent ?? 0,
    aerobicDecouplingPercent: payload.aerobicDecouplingPercent ?? null,
    isIntervalWorkout: workoutSubtype === "trainer_workout" || ["Sweet Spot", "Threshold", "VO2", "Sprint", "FTP Test"].includes(rideType),
  });
  let ownedFile: { id: string; r2Key: string; fileType: string } | undefined;
  if (payload.sourceFileId) {
    [ownedFile] = await db
      .select({ id: sourceFiles.id, r2Key: sourceFiles.r2Key, fileType: sourceFiles.fileType })
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
      const weightKg = profile?.weightKg ?? payload.weightAtRideKg ?? null;
      await db.update(rides).set({
        averagePowerWatts: payload.averagePowerWatts,
        maximumPowerWatts: payload.maximumPowerWatts,
        normalizedPowerWatts: payload.normalizedPowerWatts,
        normalizedPowerSource,
        updatedAt: new Date().toISOString(),
      }).where(eq(rides.id, existing.rideId));
      await db.update(rideMetrics).set({
        powerHeartRateRatio: finalMetrics.powerHeartRateRatio,
        powerToWeightRatio: payload.averagePowerWatts && weightKg ? payload.averagePowerWatts / weightKg : null,
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
        ...heartRateZones,
        algorithmVersion: "phase3.5",
        dataQuality: payload.normalizedPowerWatts == null ? "medium" : "high",
        calculatedAt: new Date().toISOString(),
      }).where(eq(rideMetrics.rideId, existing.rideId));
      for (const entry of payload.powerDuration ?? []) {
        if (!Number.isFinite(entry.durationSeconds) || entry.durationSeconds <= 0 || !Number.isFinite(entry.bestPowerWatts) || entry.bestPowerWatts <= 0) continue;
        await db.insert(powerDuration).values({
          rideId: existing.rideId,
          durationSeconds: Math.round(entry.durationSeconds),
          bestPowerWatts: entry.bestPowerWatts,
        }).onConflictDoUpdate({
          target: [powerDuration.rideId, powerDuration.durationSeconds],
          set: { bestPowerWatts: entry.bestPowerWatts },
        });
      }
      return Response.json({
        rideId: existing.rideId,
        metrics: { ...existing.metrics, ...finalMetrics, variabilityIndex: payload.variabilityIndex },
        duplicate: true,
        refreshed: true,
      });
    }
  }

  const id = crypto.randomUUID();
  await db.insert(rides).values({
    id,
    riderId,
    sourceFileId: payload.sourceFileId,
    source: payload.source ?? "manual",
    name,
    startedAt,
    rideType,
    rideTypeSource: "manual",
    rideContext,
    rideContextSource: "manual",
    classificationConfidence: "high",
    classificationReason: "Training stimulus and context were selected during import.",
    classificationVersion: "manual-v1",
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
    normalizedPowerSource,
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
    ...heartRateZones,
    algorithmVersion: "phase3.5",
    dataQuality: payload.normalizedPowerWatts == null ? "medium" : "high",
  });
  const durationRows = (payload.powerDuration ?? [])
    .filter((entry) => Number.isFinite(entry.durationSeconds) && entry.durationSeconds > 0 && Number.isFinite(entry.bestPowerWatts) && entry.bestPowerWatts > 0)
    .map((entry) => ({ rideId: id, durationSeconds: Math.round(entry.durationSeconds), bestPowerWatts: entry.bestPowerWatts }));
  if (durationRows.length) await db.insert(powerDuration).values(durationRows).onConflictDoNothing();
  const streamSampleCounts = normalizeStreamRecordCounts(payload.streamSampleCounts);
  const availableStreams = [...new Set([...(payload.availableStreams ?? []), ...Object.keys(streamSampleCounts)].map((stream) => String(stream).trim().toLowerCase()).filter(Boolean))];
  if (ownedFile && Number.isFinite(payload.sampleCount) && (payload.sampleCount ?? 0) > 0) {
    await db.insert(activityStreams).values({
      rideId: id,
      r2Key: ownedFile.r2Key,
      encoding: `source/${payload.source ?? ownedFile.fileType}`,
      sampleCount: Math.round(payload.sampleCount!),
      availableStreamsJson: JSON.stringify(availableStreams),
      streamSampleCountsJson: JSON.stringify(streamSampleCounts),
      startedAt,
      endedAt: new Date(Date.parse(startedAt!) + (elapsedTimeS * 1000)).toISOString(),
    }).onConflictDoNothing();
  }

  return Response.json({ rideId: id, metrics: finalMetrics, recovery, duplicate: false }, { status: 201 });
}

export async function PATCH(request: Request) {
  const riderId = await riderIdFor(request);
  if (!riderId) return Response.json({ error: "Sign in to update rides." }, { status: 401 });

  let payload: { action?: "reclassify_automatic"; rideId?: string; rideType?: RideTrainingType; rideContext?: RideContext };
  try {
    payload = await request.json() as typeof payload;
  } catch {
    return Response.json({ error: "Choose a valid classification." }, { status: 400 });
  }
  const db = getDb();

  if (payload.action === "reclassify_automatic") {
    const rows = await db.select({ ride: rides, metrics: rideMetrics }).from(rides)
      .leftJoin(rideMetrics, eq(rideMetrics.rideId, rides.id))
      .where(eq(rides.riderId, riderId));
    let updated = 0;
    let preserved = 0;
    for (const row of rows) {
      const preserveType = row.ride.rideTypeSource === "manual";
      const preserveContext = row.ride.rideContextSource === "manual";
      if (preserveType && preserveContext) {
        preserved += 1;
        continue;
      }
      const automatic = classifyRide({
        name: row.ride.name,
        workoutSubtype: row.ride.workoutSubtype,
        intensityFactor: row.metrics?.intensityFactor ?? null,
        movingTimeSeconds: row.ride.movingTimeS,
        variabilityIndex: row.metrics?.variabilityIndex ?? null,
      });
      await db.update(rides).set({
        ...(!preserveType ? { rideType: automatic.trainingType, rideTypeSource: "automatic" } : {}),
        ...(!preserveContext ? { rideContext: automatic.context, rideContextSource: "automatic" } : {}),
        classificationConfidence: automatic.confidence,
        classificationReason: `${automatic.reason}${preserveType || preserveContext ? " A manual override was preserved." : ""}`,
        classificationVersion: automatic.version,
        updatedAt: new Date().toISOString(),
      }).where(eq(rides.id, row.ride.id));
      updated += 1;
    }
    return Response.json({ updated, preserved, total: rows.length });
  }

  const rideId = payload.rideId?.trim();
  const validType = payload.rideType === undefined || allowedRideTypes.has(payload.rideType);
  const validContext = payload.rideContext === undefined || allowedRideContexts.has(payload.rideContext);
  if (!rideId || (!payload.rideType && !payload.rideContext) || !validType || !validContext) {
    return Response.json({ error: "Ride and a valid classification change are required." }, { status: 400 });
  }

  const [ownedRide] = await db.select({ id: rides.id }).from(rides)
    .where(and(eq(rides.id, rideId), eq(rides.riderId, riderId)))
    .limit(1);
  if (!ownedRide) return Response.json({ error: "Ride not found." }, { status: 404 });

  const update: {
    rideType?: RideTrainingType;
    rideTypeSource?: string;
    rideContext?: RideContext;
    rideContextSource?: string;
    classificationConfidence: "high";
    classificationReason: string;
    classificationVersion: string;
    updatedAt: string;
  } = {
    classificationConfidence: "high",
    classificationReason: "Manually classified by the rider.",
    classificationVersion: "manual-v1",
    updatedAt: new Date().toISOString(),
  };
  if (payload.rideType) {
    update.rideType = payload.rideType === "Zone 2 benchmark" ? "Zone 2" : payload.rideType;
    update.rideTypeSource = "manual";
  }
  if (payload.rideContext) {
    update.rideContext = payload.rideContext;
    update.rideContextSource = "manual";
  }
  await db.update(rides).set(update).where(eq(rides.id, rideId));
  return Response.json({ rideId, rideType: update.rideType, rideContext: update.rideContext, source: "manual" });
}
