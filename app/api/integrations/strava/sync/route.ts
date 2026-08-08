import { and, desc, eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getDb } from "../../../../../db";
import { activityStreams, externalConnections, ftpHistory, powerDuration as powerDurationTable, rideMetrics, riders, rides } from "../../../../../db/schema";
import { currentRider } from "../../../../../lib/current-rider";
import { derivePowerDuration, deriveStreamMetrics, type ActivitySample } from "../../../../../lib/activity-parser";
import { deriveRideMetrics, evaluateDecouplingEligibility } from "../../../../../lib/metrics";
import { classifyStravaActivity, classifyStravaRideType, ftpSnapshotForRide, isCyclingActivity, parseReadBudget, shouldRunAutomaticSync, syncAfterEpoch, type StravaSyncMode } from "../../../../../lib/strava-sync";

type StravaActivity = {
  id: number;
  name: string;
  sport_type?: string;
  type?: string;
  start_date: string;
  timezone?: string;
  distance?: number;
  moving_time?: number;
  elapsed_time?: number;
  total_elevation_gain?: number;
  average_speed?: number;
  max_speed?: number;
  average_heartrate?: number;
  max_heartrate?: number;
  average_cadence?: number;
  average_watts?: number;
  max_watts?: number;
  weighted_average_watts?: number;
  kilojoules?: number;
  calories?: number;
  trainer?: boolean;
  workout_type?: number | null;
};

type Stream = { data?: number[] };
type StreamSet = Record<string, Stream | undefined>;
type TokenResponse = { access_token?: string; refresh_token?: string; expires_at?: number; message?: string };
type SyncPayload = { mode?: StravaSyncMode; automatic?: boolean };

const ACTIVITIES_PER_PAGE = 200;
const MAX_ACTIVITY_PAGES = 10;
const MAX_STREAM_REQUESTS = 40;

const finite = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : null;

function samplesFromStreams(streams: StreamSet, startedAt: string): ActivitySample[] {
  const names = ["time", "distance", "heartrate", "cadence", "watts", "altitude"];
  const length = Math.max(0, ...names.map((name) => streams[name]?.data?.length ?? 0));
  const startMs = Date.parse(startedAt);
  return Array.from({ length }, (_, index) => {
    const offset = finite(streams.time?.data?.[index]);
    return {
      time: Number.isFinite(startMs) && offset !== null ? startMs + (offset * 1000) : null,
      latitude: null,
      longitude: null,
      elevation: finite(streams.altitude?.data?.[index]),
      heartRate: finite(streams.heartrate?.data?.[index]),
      cadence: finite(streams.cadence?.data?.[index]),
      power: finite(streams.watts?.data?.[index]),
      distance: finite(streams.distance?.data?.[index]),
    };
  });
}

async function refreshAccessToken(connection: typeof externalConnections.$inferSelect) {
  const config = env as unknown as Record<string, string | undefined>;
  if (!config.STRAVA_CLIENT_ID || !config.STRAVA_CLIENT_SECRET || !connection.refreshToken) throw new Error("Strava credentials are incomplete.");
  if (connection.accessToken && (connection.expiresAt ?? 0) > Math.floor(Date.now() / 1000) + 3600) return connection.accessToken;
  const response = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.STRAVA_CLIENT_ID,
      client_secret: config.STRAVA_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: connection.refreshToken,
    }),
  });
  const token = await response.json() as TokenResponse;
  if (!response.ok || !token.access_token || !token.refresh_token || !token.expires_at) throw new Error(token.message ?? "Strava access could not be refreshed.");
  await getDb().update(externalConnections).set({
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresAt: token.expires_at,
    updatedAt: new Date().toISOString(),
  }).where(eq(externalConnections.id, connection.id));
  return token.access_token;
}

export async function POST(request: Request) {
  const rider = await currentRider(request);
  if (!rider) return Response.json({ error: "Sign in to sync Strava rides." }, { status: 401 });

  let payload: SyncPayload = {};
  if (request.headers.get("content-type")?.includes("application/json")) {
    try {
      payload = await request.json() as SyncPayload;
    } catch {
      return Response.json({ error: "Choose a valid Strava sync option." }, { status: 400 });
    }
  }
  const mode: StravaSyncMode = payload.mode === "six_months" ? "six_months" : "new";
  const db = getDb();
  const [[connection], [profile], ftpRows] = await Promise.all([
    db.select().from(externalConnections).where(and(eq(externalConnections.riderId, rider.id), eq(externalConnections.provider, "strava"))).limit(1),
    db.select({ ftp: riders.defaultFtpWatts, weightKg: riders.defaultWeightKg }).from(riders).where(eq(riders.id, rider.id)).limit(1),
    db.select({ effectiveAt: ftpHistory.effectiveAt, ftpWatts: ftpHistory.ftpWatts }).from(ftpHistory).where(eq(ftpHistory.riderId, rider.id)).orderBy(desc(ftpHistory.effectiveAt)),
  ]);
  if (!connection) return Response.json({ error: "Connect Strava before syncing rides." }, { status: 409 });
  if (!profile?.ftp || !profile.weightKg) return Response.json({ error: "Complete rider setup with your FTP and weight before syncing rides." }, { status: 409 });

  const automatic = mode === "new" && payload.automatic === true;
  const syncStartedAt = new Date();
  if (automatic && !shouldRunAutomaticSync(connection.lastSyncedAt, syncStartedAt)) {
    return Response.json({
      mode,
      automatic,
      throttled: true,
      imported: 0,
      updated: 0,
      skipped: 0,
      activitiesScanned: 0,
      streamsImported: 0,
      streamsReprocessed: 0,
      streamFailures: 0,
      streamDeferred: 0,
      lastSyncedAt: connection.lastSyncedAt,
    });
  }
  if (automatic) {
    const claimedAt = syncStartedAt.toISOString();
    await db.update(externalConnections).set({ lastSyncedAt: claimedAt, updatedAt: claimedAt }).where(eq(externalConnections.id, connection.id));
  }

  let accessToken: string;
  try {
    accessToken = await refreshAccessToken(connection);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Strava access could not be refreshed." }, { status: 502 });
  }

  const authorization = { Authorization: `Bearer ${accessToken}` };
  const afterEpoch = syncAfterEpoch(mode, syncStartedAt, connection.lastSyncedAt);
  const activitiesById = new Map<number, StravaActivity>();
  let activitiesScanned = 0;
  let streamBudget = MAX_STREAM_REQUESTS;

  for (let page = 1; page <= MAX_ACTIVITY_PAGES; page += 1) {
    const activityUrl = new URL("https://www.strava.com/api/v3/athlete/activities");
    activityUrl.searchParams.set("after", String(afterEpoch));
    activityUrl.searchParams.set("page", String(page));
    activityUrl.searchParams.set("per_page", String(ACTIVITIES_PER_PAGE));
    const activitiesResponse = await fetch(activityUrl, { headers: authorization });
    const pageActivities = await activitiesResponse.json() as StravaActivity[] | { message?: string };
    if (!activitiesResponse.ok || !Array.isArray(pageActivities)) {
      const message = !Array.isArray(pageActivities) ? pageActivities.message : null;
      return Response.json({ error: message ?? "Strava activities could not be loaded." }, { status: activitiesResponse.status === 429 ? 429 : 502 });
    }

    streamBudget = Math.min(streamBudget, parseReadBudget(activitiesResponse.headers, MAX_STREAM_REQUESTS));
    activitiesScanned += pageActivities.length;
    for (const activity of pageActivities) activitiesById.set(activity.id, activity);
    if (pageActivities.length === 0) break;
  }

  const ftp = profile.ftp;
  const fileStore = (env as unknown as { RIDE_FILES: R2Bucket }).RIDE_FILES;
  const streamCandidates: Array<{ activity: StravaActivity; rideId: string }> = [];
  const storedStreamCandidates: Array<{ activity: StravaActivity; rideId: string; r2Key: string }> = [];
  let imported = 0;
  let updated = 0;
  let skipped = 0;

  for (const activity of [...activitiesById.values()].filter(isCyclingActivity)) {
    const externalId = String(activity.id);
    const [existing] = await db.select({ id: rides.id, ftpAtRideWatts: rides.ftpAtRideWatts, ftpSnapshotSource: rides.ftpSnapshotSource, rideType: rides.rideType, rideTypeSource: rides.rideTypeSource }).from(rides)
      .where(and(eq(rides.riderId, rider.id), eq(rides.externalId, externalId)))
      .limit(1);
    const normalizedPower = finite(activity.weighted_average_watts);
    const averagePower = finite(activity.average_watts);
    const movingTime = Math.max(0, Math.round(finite(activity.moving_time) ?? 0));
    const elapsedTime = Math.max(0, Math.round(finite(activity.elapsed_time) ?? movingTime));
    const stoppedPercent = elapsedTime > 0 ? Math.max(0, ((elapsedTime - movingTime) / elapsedTime) * 100) : null;
    const classification = classifyStravaActivity(activity);
    const ftpSnapshot = ftpSnapshotForRide({
      startedAt: activity.start_date,
      history: ftpRows,
      currentFtpWatts: ftp,
      existingFtpWatts: existing?.ftpAtRideWatts,
      existingSource: existing?.ftpSnapshotSource,
    });
    const derived = deriveRideMetrics({
      movingTimeSeconds: movingTime,
      averagePowerWatts: averagePower,
      normalizedPowerWatts: normalizedPower,
      averageHeartRateBpm: finite(activity.average_heartrate),
      ftpWatts: ftpSnapshot.ftpWatts,
    });
    const automaticRideType = classifyStravaRideType({
      name: activity.name,
      workoutSubtype: classification.workoutSubtype,
      intensityFactor: derived.intensityFactor,
    });
    const preserveManualType = existing?.rideTypeSource === "manual";
    const rideSummary = {
      source: "strava_export" as const,
      name: activity.name || "Strava ride",
      startedAt: activity.start_date,
      timezone: activity.timezone,
      rideType: preserveManualType ? existing.rideType : automaticRideType,
      rideTypeSource: preserveManualType ? "manual" : "automatic",
      indoor: classification.indoor,
      environment: classification.environment,
      workoutSubtype: classification.workoutSubtype,
      routeName: activity.name || null,
      activityUrl: `https://www.strava.com/activities/${activity.id}`,
      distanceM: finite(activity.distance),
      movingTimeS: movingTime,
      elapsedTimeS: elapsedTime,
      elevationGainM: finite(activity.total_elevation_gain),
      averageSpeedMps: finite(activity.average_speed),
      maximumSpeedMps: finite(activity.max_speed),
      averageHeartRateBpm: finite(activity.average_heartrate),
      maximumHeartRateBpm: finite(activity.max_heartrate),
      averageCadenceRpm: finite(activity.average_cadence),
      averagePowerWatts: averagePower,
      maximumPowerWatts: finite(activity.max_watts),
      normalizedPowerWatts: normalizedPower,
      normalizedPowerSource: normalizedPower === null ? "unavailable" as const : "recorded" as const,
      totalWorkKj: finite(activity.kilojoules),
      calories: finite(activity.calories) === null ? null : Math.round(activity.calories!),
      ftpAtRideWatts: ftpSnapshot.ftpWatts,
      ftpSnapshotSource: ftpSnapshot.source,
      weightAtRideKg: profile.weightKg,
      notes: "Synced from Strava. Original provider values are retained separately from calculated metrics.",
      updatedAt: syncStartedAt.toISOString(),
    };
    let rideId = existing?.id;

    if (rideId) {
      await db.update(rides).set(rideSummary).where(eq(rides.id, rideId));
      await db.update(rideMetrics).set({
        powerHeartRateRatio: derived.powerHeartRateRatio,
        powerToWeightRatio: averagePower === null ? null : averagePower / profile.weightKg,
        intensityFactor: derived.intensityFactor,
        intensityIsEstimated: derived.intensityIsEstimated,
        trainingLoad: derived.trainingLoad,
        trainingLoadIsEstimated: derived.trainingLoadIsEstimated,
        variabilityIndex: normalizedPower !== null && averagePower !== null && averagePower > 0 ? normalizedPower / averagePower : null,
        stoppedPercent,
        decouplingEligible: false,
        decouplingEligibilityReason: "Detailed power and heart-rate streams are required.",
      }).where(eq(rideMetrics.rideId, rideId));
      updated += 1;
      skipped += 1;
    } else {
      rideId = crypto.randomUUID();
      await db.insert(rides).values({ id: rideId, riderId: rider.id, externalId, ...rideSummary });
      await db.insert(rideMetrics).values({
        rideId,
        powerHeartRateRatio: derived.powerHeartRateRatio,
        powerToWeightRatio: averagePower === null ? null : averagePower / profile.weightKg,
        intensityFactor: derived.intensityFactor,
        intensityIsEstimated: derived.intensityIsEstimated,
        trainingLoad: derived.trainingLoad,
        trainingLoadIsEstimated: derived.trainingLoadIsEstimated,
        variabilityIndex: normalizedPower !== null && averagePower !== null && averagePower > 0 ? normalizedPower / averagePower : null,
        stoppedPercent,
        decouplingEligible: false,
        decouplingEligibilityReason: "Detailed power and heart-rate streams are required.",
        algorithmVersion: "phase3.3",
        dataQuality: "medium",
      });
      imported += 1;
    }

    const [storedStream] = await db.select({ rideId: activityStreams.rideId, r2Key: activityStreams.r2Key }).from(activityStreams)
      .where(eq(activityStreams.rideId, rideId))
      .limit(1);
    if (storedStream?.r2Key) storedStreamCandidates.push({ activity, rideId, r2Key: storedStream.r2Key });
    else streamCandidates.push({ activity, rideId });
  }

  let streamsReprocessed = 0;
  for (const candidate of storedStreamCandidates) {
    try {
      const storedObject = await fileStore.get(candidate.r2Key);
      if (!storedObject) continue;
      const streams = JSON.parse(await storedObject.text()) as StreamSet;
      const samples = samplesFromStreams(streams, candidate.activity.start_date);
      if (!samples.length) continue;
      const streamMetrics = deriveStreamMetrics(samples);
      const candidateMovingTime = Math.max(0, Math.round(finite(candidate.activity.moving_time) ?? 0));
      const candidateElapsedTime = Math.max(0, Math.round(finite(candidate.activity.elapsed_time) ?? candidateMovingTime));
      const candidateStoppedPercent = candidateElapsedTime > 0 ? Math.max(0, ((candidateElapsedTime - candidateMovingTime) / candidateElapsedTime) * 100) : null;
      const candidateAveragePower = finite(candidate.activity.average_watts);
      const candidateNormalizedPower = finite(candidate.activity.weighted_average_watts);
      const candidateVariability = candidateNormalizedPower !== null && candidateAveragePower !== null && candidateAveragePower > 0 ? candidateNormalizedPower / candidateAveragePower : null;
      const candidateClassification = classifyStravaActivity(candidate.activity);
      const eligibility = evaluateDecouplingEligibility({
        movingTimeSeconds: candidateMovingTime,
        variabilityIndex: candidateVariability,
        stoppedPercent: candidateStoppedPercent,
        pairedSampleCount: streamMetrics.pairedSampleCount,
        pairedCoveragePercent: streamMetrics.pairedCoveragePercent,
        aerobicDecouplingPercent: streamMetrics.aerobicDecouplingPercent,
        isIntervalWorkout: candidateClassification.workoutSubtype === "trainer_workout",
      });
      await db.update(rideMetrics).set({
        aerobicDecouplingPercent: streamMetrics.aerobicDecouplingPercent,
        decouplingEligible: eligibility.eligible,
        decouplingEligibilityReason: eligibility.reason,
        stoppedPercent: candidateStoppedPercent,
        cadenceStddev: streamMetrics.cadenceStddev,
        cadenceTargetPercent: streamMetrics.cadenceTargetPercent,
        cadenceAcceptablePercent: streamMetrics.cadenceAcceptablePercent,
        cadenceLowPercent: streamMetrics.cadenceLowPercent,
        cadenceHighPercent: streamMetrics.cadenceHighPercent,
        first15HeartRateBpm: streamMetrics.first15HeartRate,
        final15HeartRateBpm: streamMetrics.final15HeartRate,
        algorithmVersion: "phase3.3",
        dataQuality: "high",
      }).where(eq(rideMetrics.rideId, candidate.rideId));
      streamsReprocessed += 1;
    } catch {
      // A missing or malformed stored stream should not prevent new rides from syncing.
    }
  }

  let streamsImported = 0;
  let streamFailures = 0;
  let attemptedStreams = 0;
  for (const candidate of streamCandidates.slice(0, streamBudget)) {
    const streamsResponse = await fetch(`https://www.strava.com/api/v3/activities/${candidate.activity.id}/streams?keys=time,distance,heartrate,cadence,watts,altitude&key_by_type=true`, { headers: authorization });
    if (streamsResponse.status === 429) break;
    attemptedStreams += 1;
    if (!streamsResponse.ok) {
      streamFailures += 1;
      continue;
    }

    const streams = await streamsResponse.json() as StreamSet;
    const samples = samplesFromStreams(streams, candidate.activity.start_date);
    if (!samples.length) {
      streamFailures += 1;
      continue;
    }
    const streamMetrics = deriveStreamMetrics(samples);
    const bests = derivePowerDuration(samples);
    const candidateMovingTime = Math.max(0, Math.round(finite(candidate.activity.moving_time) ?? 0));
    const candidateElapsedTime = Math.max(0, Math.round(finite(candidate.activity.elapsed_time) ?? candidateMovingTime));
    const candidateStoppedPercent = candidateElapsedTime > 0 ? Math.max(0, ((candidateElapsedTime - candidateMovingTime) / candidateElapsedTime) * 100) : null;
    const candidateAveragePower = finite(candidate.activity.average_watts);
    const candidateNormalizedPower = finite(candidate.activity.weighted_average_watts);
    const candidateVariability = candidateNormalizedPower !== null && candidateAveragePower !== null && candidateAveragePower > 0 ? candidateNormalizedPower / candidateAveragePower : null;
    const candidateClassification = classifyStravaActivity(candidate.activity);
    const eligibility = evaluateDecouplingEligibility({
      movingTimeSeconds: candidateMovingTime,
      variabilityIndex: candidateVariability,
      stoppedPercent: candidateStoppedPercent,
      pairedSampleCount: streamMetrics.pairedSampleCount,
      pairedCoveragePercent: streamMetrics.pairedCoveragePercent,
      aerobicDecouplingPercent: streamMetrics.aerobicDecouplingPercent,
      isIntervalWorkout: candidateClassification.workoutSubtype === "trainer_workout",
    });
    const r2Key = `${rider.id}/strava/${candidate.activity.id}.json`;
    await fileStore.put(r2Key, JSON.stringify(streams), { httpMetadata: { contentType: "application/json" } });
    await db.insert(activityStreams).values({
      rideId: candidate.rideId,
      r2Key,
      encoding: "json",
      sampleCount: samples.length,
      availableStreamsJson: JSON.stringify(Object.keys(streams)),
      startedAt: candidate.activity.start_date,
      endedAt: samples.at(-1)?.time ? new Date(samples.at(-1)!.time!).toISOString() : null,
    }).onConflictDoNothing();
    await db.update(rideMetrics).set({
      aerobicDecouplingPercent: streamMetrics.aerobicDecouplingPercent,
      decouplingEligible: eligibility.eligible,
      decouplingEligibilityReason: eligibility.reason,
      stoppedPercent: candidateStoppedPercent,
      cadenceStddev: streamMetrics.cadenceStddev,
      cadenceTargetPercent: streamMetrics.cadenceTargetPercent,
      cadenceAcceptablePercent: streamMetrics.cadenceAcceptablePercent,
      cadenceLowPercent: streamMetrics.cadenceLowPercent,
      cadenceHighPercent: streamMetrics.cadenceHighPercent,
      first15HeartRateBpm: streamMetrics.first15HeartRate,
      final15HeartRateBpm: streamMetrics.final15HeartRate,
      algorithmVersion: "phase3.3",
      dataQuality: "high",
    }).where(eq(rideMetrics.rideId, candidate.rideId));
    if (bests.length) {
      await db.insert(powerDurationTable).values(bests.map((best) => ({ rideId: candidate.rideId, ...best }))).onConflictDoNothing();
    }
    streamsImported += 1;
  }

  const lastSyncedAt = syncStartedAt.toISOString();
  await db.update(externalConnections).set({ lastSyncedAt, updatedAt: lastSyncedAt }).where(eq(externalConnections.id, connection.id));
  return Response.json({
    mode,
    automatic,
    throttled: false,
    imported,
    updated,
    skipped,
    activitiesScanned,
    streamsImported,
    streamsReprocessed,
    streamFailures,
    streamDeferred: Math.max(0, streamCandidates.length - attemptedStreams),
    historyStart: new Date(afterEpoch * 1000).toISOString(),
    lastSyncedAt,
  });
}
