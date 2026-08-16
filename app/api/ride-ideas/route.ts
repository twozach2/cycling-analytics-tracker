import { and, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { rideIdeas, riders } from "../../../db/schema";
import { currentRider } from "../../../lib/current-rider";
import { localDayKey } from "../../../lib/shared/date";
import {
  parseRideIdeaDate,
  parseRideIdeaSelection,
  type SavedRideIdea,
} from "../../../lib/ride-ideas";

type RideIdeaRow = typeof rideIdeas.$inferSelect;

function responseIdea(row: RideIdeaRow): SavedRideIdea {
  return {
    id: row.id,
    version: row.version as SavedRideIdea["version"],
    dateIso: row.dateIso,
    status: row.status,
    setting: row.setting,
    route: {
      id: row.routeId,
      name: row.routeName,
      provider: row.routeProvider,
      details: JSON.parse(row.routeDetailsJson) as SavedRideIdea["route"]["details"],
    },
    intention: JSON.parse(row.intentionJson) as SavedRideIdea["intention"],
    thresholds: {
      ftpWatts: row.ftpWatts,
      weightKg: row.weightKg,
      lthrBpm: row.lthrBpm,
    },
    completedRideId: row.completedRideId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function GET(request: Request) {
  const rider = await currentRider(request);
  if (!rider) return Response.json({ error: "Sign in to view saved ride ideas." }, { status: 401 });
  let dateIso: string;
  try {
    dateIso = parseRideIdeaDate(new URL(request.url).searchParams.get("date") ?? localDayKey(new Date()));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Ride date is invalid." }, { status: 400 });
  }
  const [row] = await getDb().select().from(rideIdeas)
    .where(and(eq(rideIdeas.riderId, rider.id), eq(rideIdeas.dateIso, dateIso)))
    .limit(1);
  return Response.json({ rideIdea: row ? responseIdea(row) : null });
}

export async function POST(request: Request) {
  const rider = await currentRider(request);
  if (!rider) return Response.json({ error: "Sign in to save a ride idea." }, { status: 401 });
  let selection;
  try {
    selection = parseRideIdeaSelection(await request.json());
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Ride idea is invalid." }, { status: 400 });
  }

  const db = getDb();
  const timestamp = new Date().toISOString();
  await db.insert(riders).values({ id: rider.id, displayName: rider.name }).onConflictDoNothing();
  await db.insert(rideIdeas).values({
    id: crypto.randomUUID(),
    riderId: rider.id,
    version: selection.version,
    dateIso: selection.dateIso,
    status: "selected",
    setting: selection.setting,
    routeId: selection.route.id,
    routeName: selection.route.name,
    routeProvider: selection.route.provider,
    routeDetailsJson: JSON.stringify(selection.route.details),
    intentionVersion: selection.intention.version,
    intentionMode: selection.intention.mode,
    commitmentMinutes: selection.intention.duration.targetMinutes,
    intentionJson: JSON.stringify(selection.intention),
    ftpWatts: selection.thresholds.ftpWatts,
    weightKg: selection.thresholds.weightKg,
    lthrBpm: selection.thresholds.lthrBpm,
    confidence: selection.intention.evidence.confidence,
    evidenceRationale: selection.intention.evidence.rationale,
    updatedAt: timestamp,
  }).onConflictDoUpdate({
    target: [rideIdeas.riderId, rideIdeas.dateIso],
    set: {
      version: selection.version,
      status: "selected",
      setting: selection.setting,
      routeId: selection.route.id,
      routeName: selection.route.name,
      routeProvider: selection.route.provider,
      routeDetailsJson: JSON.stringify(selection.route.details),
      intentionVersion: selection.intention.version,
      intentionMode: selection.intention.mode,
      commitmentMinutes: selection.intention.duration.targetMinutes,
      intentionJson: JSON.stringify(selection.intention),
      ftpWatts: selection.thresholds.ftpWatts,
      weightKg: selection.thresholds.weightKg,
      lthrBpm: selection.thresholds.lthrBpm,
      confidence: selection.intention.evidence.confidence,
      evidenceRationale: selection.intention.evidence.rationale,
      completedRideId: null,
      updatedAt: timestamp,
    },
  });
  const [saved] = await db.select().from(rideIdeas)
    .where(and(eq(rideIdeas.riderId, rider.id), eq(rideIdeas.dateIso, selection.dateIso)))
    .limit(1);
  return Response.json({ rideIdea: responseIdea(saved!) }, { status: 201 });
}
