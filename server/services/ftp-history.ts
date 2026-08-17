import { asc, eq } from "drizzle-orm";
import { getDb } from "../../db";
import { ftpHistory, rideMetrics, riders, rides } from "../../db/schema";
import { deriveRideMetrics } from "../../lib/metrics";
import { ftpSnapshotForRide } from "../../lib/strava-sync";

export type FtpHistoryView = {
  id: string;
  effectiveAt: string;
  ftpWatts: number;
  source: string;
  notes: string;
  affectedRideCount: number;
};

export type FtpHistoryState = {
  entries: FtpHistoryView[];
  currentFtpWatts: number | null;
  coverage: {
    totalRides: number;
    historicalRides: number;
    uncoveredRides: number;
    earliestRideAt: string | null;
  };
};

export function normalizeFtpEffectiveDate(value: string, now = new Date()) {
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) throw new Error("Choose a valid effective date.");
  const [year, month, day] = trimmed.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) throw new Error("Choose a valid effective date.");
  if (trimmed > now.toISOString().slice(0, 10)) throw new Error("FTP history cannot start in the future.");
  return `${trimmed}T00:00:00.000Z`;
}

function historyMatch<T extends { effectiveAt: string }>(entries: readonly T[], startedAt: string) {
  const rideTime = Date.parse(startedAt);
  if (!Number.isFinite(rideTime)) return undefined;
  return [...entries].reverse().find((entry) => Date.parse(entry.effectiveAt) <= rideTime);
}

export async function loadFtpHistoryState(riderId: string): Promise<FtpHistoryState> {
  const db = getDb();
  const [[profile], entries, rideRows] = await Promise.all([
    db.select({ defaultFtpWatts: riders.defaultFtpWatts }).from(riders).where(eq(riders.id, riderId)).limit(1),
    db.select().from(ftpHistory).where(eq(ftpHistory.riderId, riderId)).orderBy(asc(ftpHistory.effectiveAt)),
    db.select({ startedAt: rides.startedAt }).from(rides).where(eq(rides.riderId, riderId)).orderBy(asc(rides.startedAt)),
  ]);
  const affected = new Map(entries.map((entry) => [entry.id, 0]));
  let historicalRides = 0;
  for (const ride of rideRows) {
    const match = historyMatch(entries, ride.startedAt);
    if (!match) continue;
    historicalRides += 1;
    affected.set(match.id, (affected.get(match.id) ?? 0) + 1);
  }
  return {
    entries: [...entries].reverse().map((entry) => ({
      id: entry.id,
      effectiveAt: entry.effectiveAt,
      ftpWatts: entry.ftpWatts,
      source: entry.source,
      notes: entry.notes,
      affectedRideCount: affected.get(entry.id) ?? 0,
    })),
    currentFtpWatts: profile?.defaultFtpWatts ?? entries.at(-1)?.ftpWatts ?? null,
    coverage: {
      totalRides: rideRows.length,
      historicalRides,
      uncoveredRides: rideRows.length - historicalRides,
      earliestRideAt: rideRows[0]?.startedAt ?? null,
    },
  };
}

function sameNullableNumber(left: number | null, right: number | null) {
  return left === null || right === null ? left === right : Math.abs(left - right) < 0.0005;
}

export async function recalculateFtpDependentRideMetrics(riderId: string) {
  const db = getDb();
  const [[profile], entries, rideRows] = await Promise.all([
    db.select({ defaultFtpWatts: riders.defaultFtpWatts }).from(riders).where(eq(riders.id, riderId)).limit(1),
    db.select().from(ftpHistory).where(eq(ftpHistory.riderId, riderId)).orderBy(asc(ftpHistory.effectiveAt)),
    db.select({ ride: rides, metrics: rideMetrics }).from(rides)
      .leftJoin(rideMetrics, eq(rideMetrics.rideId, rides.id))
      .where(eq(rides.riderId, riderId)),
  ]);
  const currentFtpWatts = entries.at(-1)?.ftpWatts ?? profile?.defaultFtpWatts ?? null;
  if (entries.length && currentFtpWatts !== profile?.defaultFtpWatts) {
    await db.update(riders).set({ defaultFtpWatts: currentFtpWatts }).where(eq(riders.id, riderId));
  }

  let updatedRides = 0;
  for (const row of rideRows) {
    const preserveStoredSnapshot = row.ride.ftpSnapshotSource !== "ftp_history";
    const snapshot = ftpSnapshotForRide({
      startedAt: row.ride.startedAt,
      history: entries,
      currentFtpWatts,
      existingFtpWatts: preserveStoredSnapshot ? row.ride.ftpAtRideWatts : null,
      existingSource: preserveStoredSnapshot ? row.ride.ftpSnapshotSource : null,
    });
    const derived = deriveRideMetrics({
      movingTimeSeconds: row.ride.movingTimeS ?? 0,
      averagePowerWatts: row.ride.averagePowerWatts,
      normalizedPowerWatts: row.ride.normalizedPowerWatts,
      averageHeartRateBpm: row.ride.averageHeartRateBpm,
      ftpWatts: snapshot.ftpWatts,
    });
    const snapshotChanged = row.ride.ftpAtRideWatts !== snapshot.ftpWatts || row.ride.ftpSnapshotSource !== snapshot.source;
    const metricsChanged = !row.metrics ||
      !sameNullableNumber(row.metrics.intensityFactor, derived.intensityFactor) ||
      !sameNullableNumber(row.metrics.trainingLoad, derived.trainingLoad) ||
      row.metrics.intensityIsEstimated !== derived.intensityIsEstimated ||
      row.metrics.trainingLoadIsEstimated !== derived.trainingLoadIsEstimated;
    if (!snapshotChanged && !metricsChanged) continue;

    const recalculatedAt = new Date().toISOString();
    if (snapshotChanged) {
      await db.update(rides).set({
        ftpAtRideWatts: snapshot.ftpWatts,
        ftpSnapshotSource: snapshot.source,
        updatedAt: recalculatedAt,
      }).where(eq(rides.id, row.ride.id));
    }
    if (row.metrics) {
      await db.update(rideMetrics).set({
        intensityFactor: derived.intensityFactor,
        intensityIsEstimated: derived.intensityIsEstimated,
        trainingLoad: derived.trainingLoad,
        trainingLoadIsEstimated: derived.trainingLoadIsEstimated,
        calculatedAt: recalculatedAt,
      }).where(eq(rideMetrics.rideId, row.ride.id));
    } else {
      await db.insert(rideMetrics).values({
        rideId: row.ride.id,
        powerHeartRateRatio: derived.powerHeartRateRatio,
        intensityFactor: derived.intensityFactor,
        intensityIsEstimated: derived.intensityIsEstimated,
        trainingLoad: derived.trainingLoad,
        trainingLoadIsEstimated: derived.trainingLoadIsEstimated,
        algorithmVersion: "phase3.6",
        dataQuality: row.ride.normalizedPowerWatts === null ? "medium" : "high",
        calculatedAt: recalculatedAt,
      });
    }
    updatedRides += 1;
  }
  return { updatedRides, currentFtpWatts };
}
