import { desc, eq } from "drizzle-orm";
import { getChatGPTUser } from "../../chatgpt-auth";
import { getDb } from "../../../db";
import { rideMetrics, rides } from "../../../db/schema";
import { deriveRideMetrics, recommendRecovery } from "../../../lib/metrics";

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
  elevationGainM?: number | null;
  averageHeartRateBpm?: number | null;
  maximumHeartRateBpm?: number | null;
  averageCadenceRpm?: number | null;
  maximumCadenceRpm?: number | null;
  averagePowerWatts?: number | null;
  maximumPowerWatts?: number | null;
  normalizedPowerWatts?: number | null;
  ftpAtRideWatts?: number | null;
  sourceTrainingLoad?: number | null;
};

export async function POST(request: Request) {
  const riderId = await riderIdFor(request);
  if (!riderId) return Response.json({ error: "Sign in to save rides." }, { status: 401 });
  const payload = (await request.json()) as RidePayload;
  const name = payload.name?.trim();
  const startedAt = payload.startedAt && Number.isFinite(Date.parse(payload.startedAt)) ? payload.startedAt : null;
  if (!name || !startedAt) return Response.json({ error: "Ride name and start time are required." }, { status: 400 });

  const movingTimeS = Math.max(0, Math.round(payload.movingTimeS ?? 0));
  const metrics = deriveRideMetrics({
    movingTimeSeconds: movingTimeS,
    averagePowerWatts: payload.averagePowerWatts ?? null,
    normalizedPowerWatts: payload.normalizedPowerWatts ?? null,
    averageHeartRateBpm: payload.averageHeartRateBpm ?? null,
    ftpWatts: payload.ftpAtRideWatts ?? null,
  });
  const trainingLoad = payload.sourceTrainingLoad ?? metrics.trainingLoad;
  const finalMetrics = { ...metrics, trainingLoad, trainingLoadIsEstimated: payload.sourceTrainingLoad == null && metrics.trainingLoadIsEstimated };
  const recovery = recommendRecovery(finalMetrics, movingTimeS, 0);
  const id = crypto.randomUUID();
  const db = getDb();
  await db.insert(rides).values({
    id,
    riderId,
    sourceFileId: payload.sourceFileId,
    source: payload.source ?? "manual",
    name,
    startedAt,
    rideType: "unknown",
    distanceM: payload.distanceM,
    movingTimeS,
    elapsedTimeS: movingTimeS,
    elevationGainM: payload.elevationGainM,
    averageHeartRateBpm: payload.averageHeartRateBpm,
    maximumHeartRateBpm: payload.maximumHeartRateBpm,
    averageCadenceRpm: payload.averageCadenceRpm,
    maximumCadenceRpm: payload.maximumCadenceRpm,
    averagePowerWatts: payload.averagePowerWatts,
    maximumPowerWatts: payload.maximumPowerWatts,
    normalizedPowerWatts: payload.normalizedPowerWatts,
    normalizedPowerSource: payload.normalizedPowerWatts == null ? "unavailable" : "recorded",
    ftpAtRideWatts: payload.ftpAtRideWatts,
  });
  await db.insert(rideMetrics).values({
    rideId: id,
    powerHeartRateRatio: finalMetrics.powerHeartRateRatio,
    intensityFactor: finalMetrics.intensityFactor,
    intensityIsEstimated: finalMetrics.intensityIsEstimated,
    trainingLoad: finalMetrics.trainingLoad,
    trainingLoadIsEstimated: finalMetrics.trainingLoadIsEstimated,
    dataQuality: payload.normalizedPowerWatts == null ? "medium" : "high",
  });

  return Response.json({ rideId: id, metrics: finalMetrics, recovery }, { status: 201 });
}
