import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { coachReflections, rideIdeas, rideMetrics, riders, rides } from "../../../db/schema";
import {
  buildCoachIntentionReflection,
  matchRideIdea,
  type CoachIntentionReflection,
  type ReflectionRide,
  type RideIdeaMatch,
} from "../../../lib/coach-reflections";
import { currentRider } from "../../../lib/current-rider";
import { parseRideIdeaDate, type SavedRideIdea } from "../../../lib/ride-ideas";
import { localDayKey } from "../../../lib/shared/date";

type RideIdeaRow = typeof rideIdeas.$inferSelect;
type ReflectionRow = typeof coachReflections.$inferSelect;
type RideRow = { ride: typeof rides.$inferSelect; metrics: typeof rideMetrics.$inferSelect | null };

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
    thresholds: { ftpWatts: row.ftpWatts, weightKg: row.weightKg, lthrBpm: row.lthrBpm },
    completedRideId: row.completedRideId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function responseReflection(row: ReflectionRow) {
  return JSON.parse(row.reflectionJson) as CoachIntentionReflection;
}

function reflectionRide(row: RideRow): ReflectionRide {
  return {
    id: row.ride.id,
    name: row.ride.name,
    routeName: row.ride.routeName,
    startedAt: row.ride.startedAt,
    environment: row.ride.environment,
    trainingType: row.ride.rideType,
    movingTimeSeconds: Math.max(0, row.ride.movingTimeS ?? 0),
    trainingLoad: Math.max(0, row.metrics?.trainingLoad ?? 0),
    intensityFactor: Math.max(0, row.metrics?.intensityFactor ?? 0),
    averagePowerWatts: row.ride.averagePowerWatts,
    normalizedPowerWatts: row.ride.normalizedPowerWatts,
    averageHeartRateBpm: row.ride.averageHeartRateBpm,
    averageCadenceRpm: row.ride.averageCadenceRpm,
    dataQuality: row.metrics?.dataQuality === "medium" ? "moderate" : row.metrics?.dataQuality ?? "low",
  };
}

async function reflectionHistory(riderId: string) {
  const rows = await getDb().select().from(coachReflections)
    .where(eq(coachReflections.riderId, riderId))
    .orderBy(desc(coachReflections.dateIso), desc(coachReflections.createdAt))
    .limit(12);
  return rows.map(responseReflection);
}

async function rideRowsForRider(riderId: string) {
  return getDb().select({ ride: rides, metrics: rideMetrics }).from(rides)
    .leftJoin(rideMetrics, eq(rideMetrics.rideId, rides.id))
    .where(eq(rides.riderId, riderId))
    .orderBy(desc(rides.startedAt))
    .limit(250);
}

async function existingReflection(riderId: string, idea: RideIdeaRow | null) {
  if (!idea) return null;
  const [row] = await getDb().select().from(coachReflections)
    .where(and(
      eq(coachReflections.riderId, riderId),
      eq(coachReflections.rideIdeaId, idea.id),
      eq(coachReflections.rideIdeaUpdatedAt, idea.updatedAt),
    ))
    .limit(1);
  return row ?? null;
}

async function ideaForDate(riderId: string, dateIso: string) {
  const [row] = await getDb().select().from(rideIdeas)
    .where(and(eq(rideIdeas.riderId, riderId), eq(rideIdeas.dateIso, dateIso)))
    .limit(1);
  return row ?? null;
}

export async function GET(request: Request) {
  const rider = await currentRider(request);
  if (!rider) return Response.json({ error: "Sign in to view coach reflections." }, { status: 401 });
  let dateIso: string;
  try {
    dateIso = parseRideIdeaDate(new URL(request.url).searchParams.get("date") ?? localDayKey(new Date()));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Reflection date is invalid." }, { status: 400 });
  }
  const idea = await ideaForDate(rider.id, dateIso);
  const [current, history] = await Promise.all([existingReflection(rider.id, idea), reflectionHistory(rider.id)]);
  return Response.json({
    rideIdea: idea ? responseIdea(idea) : null,
    reflection: current ? responseReflection(current) : null,
    history,
    candidates: [],
    awaitingReason: idea ? `No completed ride has been linked to ${idea.routeName} yet.` : "Save a ride idea to receive an intention-aware reflection.",
  });
}

export async function POST(request: Request) {
  const rider = await currentRider(request);
  if (!rider) return Response.json({ error: "Sign in to reconcile a completed ride." }, { status: 401 });
  let body: { dateIso?: unknown; rideId?: unknown };
  try {
    body = await request.json() as typeof body;
  } catch {
    return Response.json({ error: "Reflection request must be valid JSON." }, { status: 400 });
  }
  let dateIso: string;
  try {
    dateIso = parseRideIdeaDate(body.dateIso ?? localDayKey(new Date()));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Reflection date is invalid." }, { status: 400 });
  }

  const ideaRow = await ideaForDate(rider.id, dateIso);
  const existing = await existingReflection(rider.id, ideaRow);
  if (!ideaRow) return Response.json({
    rideIdea: null,
    reflection: null,
    history: await reflectionHistory(rider.id),
    candidates: [],
    awaitingReason: "Save a ride idea to receive an intention-aware reflection.",
  });
  if (existing && typeof body.rideId !== "string") return Response.json({
    rideIdea: responseIdea(ideaRow),
    reflection: responseReflection(existing),
    history: await reflectionHistory(rider.id),
    candidates: [],
    awaitingReason: null,
  });

  const idea = responseIdea(ideaRow);
  const rows = await rideRowsForRider(rider.id);
  const reflectionRides = rows.map(reflectionRide);
  let match: RideIdeaMatch;
  if (typeof body.rideId === "string" && body.rideId.trim()) {
    const chosenRideId = body.rideId.trim();
    const chosen = reflectionRides.find((ride) => ride.id === chosenRideId);
    if (!chosen) return Response.json({ error: "The selected ride was not found." }, { status: 404 });
    const started = new Date(chosen.startedAt);
    if (!Number.isFinite(started.getTime()) || localDayKey(started) !== dateIso) {
      return Response.json({ error: "Choose a ride recorded on the saved idea's date." }, { status: 400 });
    }
    const automatic = matchRideIdea(idea, [chosen]);
    match = {
      ride: chosen,
      confidence: automatic.ride ? automatic.confidence : "low",
      rationale: automatic.ride
        ? `You confirmed this ride. ${automatic.rationale}`
        : "You confirmed this ride manually; its recorded setting differs from the saved idea, so match confidence is low.",
      candidates: [automatic.candidates[0] ?? {
        id: chosen.id, name: chosen.name, routeName: chosen.routeName, startedAt: chosen.startedAt,
        environment: chosen.environment, trainingType: chosen.trainingType, movingTimeSeconds: chosen.movingTimeSeconds,
      }],
    };
  } else {
    match = matchRideIdea(idea, reflectionRides);
  }
  if (!match.ride || !match.confidence) return Response.json({
    rideIdea: idea,
    reflection: null,
    history: await reflectionHistory(rider.id),
    candidates: match.candidates,
    awaitingReason: match.rationale,
  });

  const timestamp = new Date().toISOString();
  const reflection = buildCoachIntentionReflection(idea, match.ride, match.confidence, match.rationale, existing?.createdAt ?? timestamp);
  const db = getDb();
  await db.insert(riders).values({ id: rider.id, displayName: rider.name }).onConflictDoNothing();
  await db.insert(coachReflections).values({
    id: existing?.id ?? crypto.randomUUID(),
    riderId: rider.id,
    rideIdeaId: idea.id,
    rideIdeaUpdatedAt: idea.updatedAt,
    rideId: match.ride.id,
    dateIso,
    reflectionVersion: reflection.version,
    matchConfidence: reflection.matchConfidence,
    reflectionJson: JSON.stringify(reflection),
    beforeMode: reflection.adaptation.beforeMode,
    nextMode: reflection.adaptation.nextMode,
    adaptationVersion: reflection.adaptation.version,
    adaptationSummary: reflection.adaptation.summary,
    adaptationReasonsJson: JSON.stringify(reflection.adaptation.reasons),
    createdAt: reflection.createdAt,
    updatedAt: timestamp,
  }).onConflictDoUpdate({
    target: [coachReflections.rideIdeaId, coachReflections.rideIdeaUpdatedAt],
    set: {
      rideId: match.ride.id,
      reflectionVersion: reflection.version,
      matchConfidence: reflection.matchConfidence,
      reflectionJson: JSON.stringify(reflection),
      beforeMode: reflection.adaptation.beforeMode,
      nextMode: reflection.adaptation.nextMode,
      adaptationVersion: reflection.adaptation.version,
      adaptationSummary: reflection.adaptation.summary,
      adaptationReasonsJson: JSON.stringify(reflection.adaptation.reasons),
      updatedAt: timestamp,
    },
  });
  await db.update(rideIdeas).set({ status: "completed", completedRideId: match.ride.id })
    .where(and(eq(rideIdeas.id, idea.id), eq(rideIdeas.riderId, rider.id)));
  const completedIdea = { ...idea, status: "completed" as const, completedRideId: match.ride.id };
  return Response.json({
    rideIdea: completedIdea,
    reflection,
    history: await reflectionHistory(rider.id),
    candidates: [],
    awaitingReason: null,
  }, { status: existing ? 200 : 201 });
}
