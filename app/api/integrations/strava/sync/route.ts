import { and, eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getDb } from "../../../../../db";
import { activityStreams, externalConnections, powerDuration as powerDurationTable, rideMetrics, riders, rides } from "../../../../../db/schema";
import { currentRider } from "../../../../../lib/current-rider";
import { derivePowerDuration, deriveStreamMetrics, type ActivitySample } from "../../../../../lib/activity-parser";
import { deriveRideMetrics } from "../../../../../lib/metrics";

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
};

type Stream = { data?: number[] };
type StreamSet = Record<string, Stream | undefined>;
type TokenResponse = { access_token?: string; refresh_token?: string; expires_at?: number; message?: string };

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
  const db = getDb();
  const [[connection], [profile]] = await Promise.all([
    db.select().from(externalConnections).where(and(eq(externalConnections.riderId, rider.id), eq(externalConnections.provider, "strava"))).limit(1),
    db.select({ ftp: riders.defaultFtpWatts }).from(riders).where(eq(riders.id, rider.id)).limit(1),
  ]);
  if (!connection) return Response.json({ error: "Connect Strava before syncing rides." }, { status: 409 });

  let accessToken: string;
  try {
    accessToken = await refreshAccessToken(connection);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Strava access could not be refreshed." }, { status: 502 });
  }
  const authorization = { Authorization: `Bearer ${accessToken}` };
  const activitiesResponse = await fetch("https://www.strava.com/api/v3/athlete/activities?per_page=10&page=1", { headers: authorization });
  const activities = await activitiesResponse.json() as StravaActivity[] | { message?: string };
  if (!activitiesResponse.ok || !Array.isArray(activities)) {
    return Response.json({ error: !Array.isArray(activities) ? activities.message ?? "Strava activities could not be loaded." : "Strava activities could not be loaded." }, { status: activitiesResponse.status === 429 ? 429 : 502 });
  }

  let imported = 0;
  let skipped = 0;
  let streamFailures = 0;
  const ftp = profile?.ftp ?? 165;
  const fileStore = (env as unknown as { RIDE_FILES: R2Bucket }).RIDE_FILES;
  for (const activity of activities.filter((entry) => (entry.sport_type ?? entry.type ?? "").toLowerCase().includes("ride"))) {
    const externalId = String(activity.id);
    const [existing] = await db.select({ id: rides.id }).from(rides)
      .where(and(eq(rides.riderId, rider.id), eq(rides.externalId, externalId)))
      .limit(1);
    if (existing) {
      skipped += 1;
      continue;
    }

    let streams: StreamSet = {};
    const streamsResponse = await fetch(`https://www.strava.com/api/v3/activities/${activity.id}/streams?keys=time,distance,heartrate,cadence,watts,altitude&key_by_type=true`, { headers: authorization });
    if (streamsResponse.ok) streams = await streamsResponse.json() as StreamSet;
    else streamFailures += 1;
    const samples = samplesFromStreams(streams, activity.start_date);
    const streamMetrics = deriveStreamMetrics(samples);
    const bests = derivePowerDuration(samples);
    const normalizedPower = finite(activity.weighted_average_watts);
    const averagePower = finite(activity.average_watts);
    const movingTime = Math.max(0, Math.round(finite(activity.moving_time) ?? 0));
    const derived = deriveRideMetrics({
      movingTimeSeconds: movingTime,
      averagePowerWatts: averagePower,
      normalizedPowerWatts: normalizedPower,
      averageHeartRateBpm: finite(activity.average_heartrate),
      ftpWatts: ftp,
    });
    const rideId = crypto.randomUUID();
    await db.insert(rides).values({
      id: rideId,
      riderId: rider.id,
      externalId,
      source: "strava_export",
      name: activity.name || "Strava ride",
      startedAt: activity.start_date,
      timezone: activity.timezone,
      rideType: "Free ride",
      indoor: Boolean(activity.trainer),
      routeName: activity.name || null,
      activityUrl: `https://www.strava.com/activities/${activity.id}`,
      distanceM: finite(activity.distance),
      movingTimeS: movingTime,
      elapsedTimeS: Math.max(0, Math.round(finite(activity.elapsed_time) ?? movingTime)),
      elevationGainM: finite(activity.total_elevation_gain),
      averageSpeedMps: finite(activity.average_speed),
      maximumSpeedMps: finite(activity.max_speed),
      averageHeartRateBpm: finite(activity.average_heartrate),
      maximumHeartRateBpm: finite(activity.max_heartrate),
      averageCadenceRpm: finite(activity.average_cadence),
      averagePowerWatts: averagePower,
      maximumPowerWatts: finite(activity.max_watts),
      normalizedPowerWatts: normalizedPower,
      normalizedPowerSource: normalizedPower === null ? "unavailable" : "recorded",
      totalWorkKj: finite(activity.kilojoules),
      calories: finite(activity.calories) === null ? null : Math.round(activity.calories!),
      ftpAtRideWatts: ftp,
      notes: "Synced from Strava. Original provider values are retained separately from calculated metrics.",
    });
    await db.insert(rideMetrics).values({
      rideId,
      powerHeartRateRatio: derived.powerHeartRateRatio,
      intensityFactor: derived.intensityFactor,
      intensityIsEstimated: derived.intensityIsEstimated,
      trainingLoad: derived.trainingLoad,
      trainingLoadIsEstimated: derived.trainingLoadIsEstimated,
      variabilityIndex: normalizedPower !== null && averagePower !== null && averagePower > 0 ? normalizedPower / averagePower : null,
      aerobicDecouplingPercent: streamMetrics.aerobicDecouplingPercent,
      cadenceStddev: streamMetrics.cadenceStddev,
      cadenceTargetPercent: streamMetrics.cadenceTargetPercent,
      cadenceAcceptablePercent: streamMetrics.cadenceAcceptablePercent,
      cadenceLowPercent: streamMetrics.cadenceLowPercent,
      cadenceHighPercent: streamMetrics.cadenceHighPercent,
      first15HeartRateBpm: streamMetrics.first15HeartRate,
      final15HeartRateBpm: streamMetrics.final15HeartRate,
      algorithmVersion: "phase3.0",
      dataQuality: samples.length ? "high" : "medium",
    });
    if (bests.length) await db.insert(powerDurationTable).values(bests.map((best) => ({ rideId, ...best }))).onConflictDoNothing();
    if (samples.length) {
      const r2Key = `${rider.id}/strava/${activity.id}.json`;
      await fileStore.put(r2Key, JSON.stringify(streams), { httpMetadata: { contentType: "application/json" } });
      await db.insert(activityStreams).values({
        rideId,
        r2Key,
        encoding: "json",
        sampleCount: samples.length,
        availableStreamsJson: JSON.stringify(Object.keys(streams)),
        startedAt: activity.start_date,
        endedAt: samples.at(-1)?.time ? new Date(samples.at(-1)!.time!).toISOString() : null,
      });
    }
    imported += 1;
  }

  const lastSyncedAt = new Date().toISOString();
  await db.update(externalConnections).set({ lastSyncedAt, updatedAt: lastSyncedAt }).where(eq(externalConnections.id, connection.id));
  return Response.json({ imported, skipped, streamFailures, lastSyncedAt });
}
