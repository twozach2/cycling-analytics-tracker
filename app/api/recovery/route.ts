import { desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { recoveryLogs, riders } from "../../../db/schema";
import { currentRider } from "../../../lib/current-rider";
import type { BodyCondition, PainLocation } from "../../../lib/metrics";

export async function GET(request: Request) {
  const rider = await currentRider(request);
  if (!rider) return Response.json({ error: "Sign in to view recovery check-ins." }, { status: 401 });
  const [latest] = await getDb()
    .select()
    .from(recoveryLogs)
    .where(eq(recoveryLogs.riderId, rider.id))
    .orderBy(desc(recoveryLogs.loggedAt))
    .limit(1);
  return Response.json({ recovery: latest ?? null });
}

type RecoveryPayload = {
  sleepQuality?: number;
  legFreshness?: "fresh" | "normal" | "heavy" | "dead";
  motivation?: number;
  bodyCondition?: BodyCondition;
  painLocation?: PainLocation;
  painSeverity?: number;
  illnessSeverity?: number;
};

const bounded = (value: number | undefined, minimum: number, maximum: number, fallback: number) =>
  Number.isFinite(value) ? Math.min(maximum, Math.max(minimum, Math.round(value!))) : fallback;

const bodyConditions: BodyCondition[] = ["normal", "mild_soreness", "significant_soreness", "pain_concern", "illness"];
const painLocations: PainLocation[] = ["unspecified", "knee", "back", "neck_shoulders", "hands_wrists", "hips", "saddle_contact", "other"];

export async function POST(request: Request) {
  const rider = await currentRider(request);
  if (!rider) return Response.json({ error: "Sign in to save recovery check-ins." }, { status: 401 });
  const payload = await request.json() as RecoveryPayload;
  const legFreshness = ["fresh", "normal", "heavy", "dead"].includes(payload.legFreshness ?? "")
    ? payload.legFreshness!
    : "normal";
  const bodyCondition = bodyConditions.includes(payload.bodyCondition ?? "normal")
    ? payload.bodyCondition!
    : "normal";
  const painLocation = bodyCondition === "pain_concern" && painLocations.includes(payload.painLocation ?? "unspecified")
    ? payload.painLocation!
    : null;
  const painSeverity = bodyCondition === "pain_concern"
    ? bounded(payload.painSeverity, 1, 10, 1)
    : 0;
  const illnessSeverity = bodyCondition === "illness"
    ? bounded(payload.illnessSeverity, 1, 10, 1)
    : 0;
  const recovery = {
    id: crypto.randomUUID(),
    riderId: rider.id,
    loggedAt: new Date().toISOString(),
    sleepQuality: bounded(payload.sleepQuality, 1, 5, 3),
    legFreshness,
    motivation: bounded(payload.motivation, 1, 5, 3),
    bodyCondition,
    painLocation,
    painSeverity,
    illnessSeverity,
    // Retain legacy values so older app builds can still open new check-ins.
    generalSoreness: bodyCondition === "mild_soreness" ? 3 : bodyCondition === "significant_soreness" ? 7 : 0,
    kneePain: bodyCondition === "pain_concern" && painLocation === "knee" ? painSeverity : 0,
  };
  const db = getDb();
  await db.insert(riders).values({ id: rider.id, displayName: rider.name }).onConflictDoNothing();
  await db.insert(recoveryLogs).values(recovery);
  return Response.json({ recovery }, { status: 201 });
}
