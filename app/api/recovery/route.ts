import { desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { recoveryLogs, riders } from "../../../db/schema";
import { currentRider } from "../../../lib/current-rider";
import type { BodyCondition, PainLocation } from "../../../lib/metrics";

const dayKey = (value: string | Date) => {
  const date = new Date(value);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
};

export function restingHeartRateBaseline(
  rows: Array<{ loggedAt: string; restingHeartRate: number | null }>,
  today = dayKey(new Date()),
) {
  const dailyReadings = new Map<string, number>();
  for (const row of rows) {
    const date = dayKey(row.loggedAt);
    if (date === today || dailyReadings.has(date) || row.restingHeartRate === null || row.restingHeartRate < 30 || row.restingHeartRate > 120) continue;
    dailyReadings.set(date, row.restingHeartRate);
  }
  const values = [...dailyReadings.values()].slice(0, 7).sort((a, b) => a - b);
  if (values.length < 3) return null;
  const midpoint = Math.floor(values.length / 2);
  return values.length % 2 ? values[midpoint] : Math.round((values[midpoint - 1] + values[midpoint]) / 2);
}

export async function GET(request: Request) {
  const rider = await currentRider(request);
  if (!rider) return Response.json({ error: "Sign in to view recovery check-ins." }, { status: 401 });
  const rows = await getDb()
    .select()
    .from(recoveryLogs)
    .where(eq(recoveryLogs.riderId, rider.id))
    .orderBy(desc(recoveryLogs.loggedAt))
    .limit(20);
  const latest = rows[0] ?? null;
  const today = dayKey(new Date());
  return Response.json({
    recovery: latest,
    recordedToday: Boolean(latest && dayKey(latest.loggedAt) === today),
    restingHeartRateBaseline: restingHeartRateBaseline(rows, today),
  });
}

type RecoveryPayload = {
  sleepQuality?: number;
  legFreshness?: "fresh" | "normal" | "heavy" | "dead";
  motivation?: number;
  bodyCondition?: BodyCondition;
  painLocation?: PainLocation;
  painSeverity?: number;
  illnessSeverity?: number;
  restingHeartRate?: number | null;
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
  const restingHeartRate = payload.restingHeartRate == null
    ? null
    : bounded(payload.restingHeartRate, 30, 120, 60);
  const loggedAt = new Date().toISOString();
  const recovery = {
    id: crypto.randomUUID(),
    riderId: rider.id,
    loggedAt,
    sleepQuality: bounded(payload.sleepQuality, 1, 5, 3),
    legFreshness,
    motivation: bounded(payload.motivation, 1, 5, 3),
    bodyCondition,
    painLocation,
    painSeverity,
    illnessSeverity,
    restingHeartRate,
    // Retain legacy values so older app builds can still open new check-ins.
    generalSoreness: bodyCondition === "mild_soreness" ? 3 : bodyCondition === "significant_soreness" ? 7 : 0,
    kneePain: bodyCondition === "pain_concern" && painLocation === "knee" ? painSeverity : 0,
  };
  const db = getDb();
  const history = await db.select({ loggedAt: recoveryLogs.loggedAt, restingHeartRate: recoveryLogs.restingHeartRate })
    .from(recoveryLogs)
    .where(eq(recoveryLogs.riderId, rider.id))
    .orderBy(desc(recoveryLogs.loggedAt))
    .limit(20);
  const baseline = restingHeartRateBaseline(history, dayKey(loggedAt));
  await db.insert(riders).values({ id: rider.id, displayName: rider.name }).onConflictDoNothing();
  await db.insert(recoveryLogs).values(recovery);
  return Response.json({ recovery, recordedToday: true, restingHeartRateBaseline: baseline }, { status: 201 });
}
