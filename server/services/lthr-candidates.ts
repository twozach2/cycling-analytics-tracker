import { desc, eq } from "drizzle-orm";
import { getDb } from "../../db";
import { activityStreams, rides } from "../../db/schema";
import { detectLthrCandidate, rankLthrCandidates, type LthrCandidate } from "../../lib/lthr";
import { getFileStore } from "../platform/file-store";

type StoredStream = { data?: unknown[] };
type StoredStreams = Record<string, StoredStream | undefined>;

const numericData = (stream: StoredStream | undefined) => (stream?.data ?? [])
  .map((value) => typeof value === "number" && Number.isFinite(value) ? value : Number.NaN);

export async function loadLthrCandidates(riderId: string): Promise<LthrCandidate[]> {
  const db = getDb();
  const rows = await db.select({
    rideId: rides.id,
    rideName: rides.name,
    startedAt: rides.startedAt,
    movingTimeSeconds: rides.movingTimeS,
    rideType: rides.rideType,
    rideContext: rides.rideContext,
    ftpAtRideWatts: rides.ftpAtRideWatts,
    averagePowerWatts: rides.averagePowerWatts,
    normalizedPowerWatts: rides.normalizedPowerWatts,
    r2Key: activityStreams.r2Key,
    encoding: activityStreams.encoding,
  })
    .from(rides)
    .innerJoin(activityStreams, eq(activityStreams.rideId, rides.id))
    .where(eq(rides.riderId, riderId))
    .orderBy(desc(rides.startedAt))
    .limit(100);

  const fileStore = getFileStore();
  const candidates = await Promise.all(rows.map(async (row) => {
    const ftp = row.ftpAtRideWatts;
    const powerSignal = Math.max(row.averagePowerWatts ?? 0, row.normalizedPowerWatts ?? 0);
    if (!ftp || (row.movingTimeSeconds ?? 0) < 25 * 60 || powerSignal < ftp * 0.85 || row.encoding !== "json") return null;
    try {
      const stored = await fileStore.get(row.r2Key);
      if (!stored) return null;
      const streams = JSON.parse(await stored.text()) as StoredStreams;
      return detectLthrCandidate({
        rideId: row.rideId,
        rideName: row.rideName,
        startedAt: row.startedAt,
        movingTimeSeconds: row.movingTimeSeconds ?? 0,
        rideType: row.rideType,
        rideContext: row.rideContext,
        ftpAtRideWatts: ftp,
        time: numericData(streams.time),
        watts: numericData(streams.watts),
        heartRate: numericData(streams.heartrate),
      });
    } catch {
      return null;
    }
  }));

  return rankLthrCandidates(candidates.filter((candidate): candidate is LthrCandidate => candidate !== null)).slice(0, 5);
}
