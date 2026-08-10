import { and, desc, eq, lte } from "drizzle-orm";
import { getDb } from "../../../db";
import { externalConnections, ftpHistory, powerDuration, riderGoals, riders, rides } from "../../../db/schema";
import { currentRider } from "../../../lib/current-rider";
import { buildCyclingVo2Trend, buildPowerRecordHistory, predictFtp } from "../../../lib/phase3";
import { getSecretStore, STRAVA_SECRETS } from "../../../server/platform/secret-store";

export async function GET(request: Request) {
  const rider = await currentRider(request);
  if (!rider) return Response.json({ error: "Sign in to view training insights." }, { status: 401 });
  const db = getDb();
  const [[profile], ftpRows, [goal], connections, powerEfforts, fiveMinuteEfforts] = await Promise.all([
    db.select().from(riders).where(eq(riders.id, rider.id)).limit(1),
    db.select().from(ftpHistory).where(eq(ftpHistory.riderId, rider.id)).orderBy(desc(ftpHistory.effectiveAt)).limit(24),
    db.select().from(riderGoals).where(and(eq(riderGoals.riderId, rider.id), eq(riderGoals.status, "active"))).orderBy(desc(riderGoals.createdAt)).limit(1),
    db.select({ provider: externalConnections.provider, displayName: externalConnections.displayName, lastSyncedAt: externalConnections.lastSyncedAt })
      .from(externalConnections)
      .where(eq(externalConnections.riderId, rider.id)),
    db.select({
      rideId: rides.id,
      rideName: rides.name,
      startedAt: rides.startedAt,
      durationSeconds: powerDuration.durationSeconds,
      bestPowerWatts: powerDuration.bestPowerWatts,
    })
      .from(powerDuration)
      .innerJoin(rides, eq(powerDuration.rideId, rides.id))
      .where(eq(rides.riderId, rider.id)),
    db.select({
      startedAt: rides.startedAt,
      fiveMinutePowerWatts: powerDuration.bestPowerWatts,
      weightKg: rides.weightAtRideKg,
    })
      .from(powerDuration)
      .innerJoin(rides, eq(powerDuration.rideId, rides.id))
      .where(and(eq(rides.riderId, rider.id), eq(powerDuration.durationSeconds, 300))),
  ]);
  const currentFtpWatts = profile?.defaultFtpWatts ?? ftpRows[0]?.ftpWatts ?? null;
  const weightKg = profile?.defaultWeightKg ?? null;
  const prediction = currentFtpWatts === null
    ? { minimumWatts: null, maximumWatts: null, midpointWatts: null, confidence: "none", signals: ["Enter an FTP to enable power-based predictions."] }
    : predictFtp(powerEfforts, currentFtpWatts);
  const powerRecords = buildPowerRecordHistory(powerEfforts);
  const strava = connections.find((connection) => connection.provider === "strava");
  const secretStore = getSecretStore();
  const [stravaClientId, stravaClientSecret, stravaAccessToken, stravaRefreshToken] = await Promise.all([
    secretStore.get(STRAVA_SECRETS.clientId),
    secretStore.get(STRAVA_SECRETS.clientSecret),
    secretStore.get(STRAVA_SECRETS.accessToken),
    secretStore.get(STRAVA_SECRETS.refreshToken),
  ]);
  const vo2Estimate = buildCyclingVo2Trend(fiveMinuteEfforts.map((effort) => ({
    startedAt: effort.startedAt,
    fiveMinutePowerWatts: effort.fiveMinutePowerWatts,
    weightKg: effort.weightKg ?? weightKg ?? 0,
  })), currentFtpWatts);

  return Response.json({
    currentFtpWatts,
    weightKg,
    profileComplete: currentFtpWatts !== null && weightKg !== null,
    ftpHistory: ftpRows.map((row) => ({ effectiveAt: row.effectiveAt, ftpWatts: row.ftpWatts, source: row.source })),
    prediction,
    vo2Estimate,
    powerRecords,
    goal: goal ? { id: goal.id, targetFtpWatts: goal.targetFtpWatts, createdAt: goal.createdAt } : null,
    integrations: {
      strava: {
        configured: Boolean(stravaClientId && stravaClientSecret),
        connected: Boolean(strava && stravaAccessToken && stravaRefreshToken),
        displayName: strava?.displayName ?? null,
        lastSyncedAt: strava?.lastSyncedAt ?? null,
      },
      garmin: {
        status: "application_required",
        detail: "Garmin Connect Activity API access requires approval; FIT uploads remain fully supported.",
      },
    },
  });
}

type PhaseThreeAction =
  | { action: "set_goal"; targetFtpWatts: number }
  | { action: "record_ftp"; ftpWatts: number }
  | { action: "record_weight"; weightPounds: number }
  | { action: "record_profile"; ftpWatts: number; weightPounds: number };

export async function POST(request: Request) {
  const rider = await currentRider(request);
  if (!rider) return Response.json({ error: "Sign in to update athlete goals." }, { status: 401 });
  const payload = await request.json() as PhaseThreeAction;
  const db = getDb();
  await db.insert(riders).values({ id: rider.id, displayName: rider.name }).onConflictDoNothing();

  if (payload.action === "record_profile") {
    const ftpWatts = Math.round(Number(payload.ftpWatts));
    const weightPounds = Number(payload.weightPounds);
    if (!Number.isFinite(ftpWatts) || ftpWatts < 50 || ftpWatts > 500) {
      return Response.json({ error: "FTP must be between 50 and 500 watts." }, { status: 400 });
    }
    if (!Number.isFinite(weightPounds) || weightPounds < 80 || weightPounds > 500) {
      return Response.json({ error: "Weight must be between 80 and 500 pounds." }, { status: 400 });
    }
    const weightKg = Math.round((weightPounds / 2.2046226218) * 10) / 10;
    const [existing] = await db.select({ ftpWatts: riders.defaultFtpWatts }).from(riders).where(eq(riders.id, rider.id)).limit(1);
    await db.update(riders).set({ defaultFtpWatts: ftpWatts, defaultWeightKg: weightKg }).where(eq(riders.id, rider.id));
    if (existing?.ftpWatts !== ftpWatts) {
      const effectiveAt = new Date().toISOString();
      await db.insert(ftpHistory).values({ id: crypto.randomUUID(), riderId: rider.id, effectiveAt, ftpWatts, source: "rider setup", notes: "Saved with required rider profile." });
      await db.update(riderGoals).set({ status: "achieved", achievedAt: effectiveAt }).where(and(eq(riderGoals.riderId, rider.id), eq(riderGoals.status, "active"), lte(riderGoals.targetFtpWatts, ftpWatts)));
    }
    return Response.json({ ftpWatts, weightKg, weightPounds: Math.round(weightPounds), profileComplete: true }, { status: 201 });
  }

  if (payload.action === "set_goal") {
    const targetFtpWatts = Math.round(payload.targetFtpWatts);
    if (!Number.isFinite(targetFtpWatts) || targetFtpWatts < 100 || targetFtpWatts > 500) {
      return Response.json({ error: "Choose an FTP goal between 100 and 500 watts." }, { status: 400 });
    }
    await db.update(riderGoals).set({ status: "archived" }).where(and(eq(riderGoals.riderId, rider.id), eq(riderGoals.status, "active")));
    const goal = { id: crypto.randomUUID(), riderId: rider.id, targetFtpWatts, status: "active" as const };
    await db.insert(riderGoals).values(goal);
    return Response.json({ goal }, { status: 201 });
  }

  if (payload.action === "record_ftp") {
    const ftpWatts = Math.round(payload.ftpWatts);
    if (!Number.isFinite(ftpWatts) || ftpWatts < 50 || ftpWatts > 500) {
      return Response.json({ error: "FTP must be between 50 and 500 watts." }, { status: 400 });
    }
    const [profile] = await db.select({ ftpWatts: riders.defaultFtpWatts }).from(riders).where(eq(riders.id, rider.id)).limit(1);
    if (profile?.ftpWatts === ftpWatts) {
      return Response.json({ ftpWatts, unchanged: true });
    }
    const effectiveAt = new Date().toISOString();
    await db.update(riders).set({ defaultFtpWatts: ftpWatts }).where(eq(riders.id, rider.id));
    await db.insert(ftpHistory).values({ id: crypto.randomUUID(), riderId: rider.id, effectiveAt, ftpWatts, source: "manual confirmation", notes: "Confirmed from Plan Today." });
    await db.update(riderGoals).set({ status: "achieved", achievedAt: effectiveAt }).where(and(eq(riderGoals.riderId, rider.id), eq(riderGoals.status, "active"), lte(riderGoals.targetFtpWatts, ftpWatts)));
    return Response.json({ ftpWatts, effectiveAt, unchanged: false }, { status: 201 });
  }

  if (payload.action === "record_weight") {
    const weightPounds = Number(payload.weightPounds);
    if (!Number.isFinite(weightPounds) || weightPounds < 80 || weightPounds > 500) {
      return Response.json({ error: "Weight must be between 80 and 500 pounds." }, { status: 400 });
    }
    const weightKg = Math.round((weightPounds / 2.2046226218) * 10) / 10;
    await db.update(riders).set({ defaultWeightKg: weightKg }).where(eq(riders.id, rider.id));
    return Response.json({ weightKg, weightPounds: Math.round(weightPounds) }, { status: 201 });
  }

  return Response.json({ error: "Unsupported training update." }, { status: 400 });
}
