import { desc, eq } from "drizzle-orm";
import { getChatGPTUser } from "../../chatgpt-auth";
import { getDb } from "../../../db";
import { recoveryLogs, riders } from "../../../db/schema";

async function currentRider(request: Request) {
  const user = await getChatGPTUser();
  if (user) return { id: user.userId, name: user.displayName };
  const hostname = new URL(request.url).hostname;
  return hostname === "localhost" || hostname === "127.0.0.1"
    ? { id: "local-rider", name: "Local rider" }
    : null;
}

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
  soreness?: number;
  kneePain?: number;
};

const bounded = (value: number | undefined, minimum: number, maximum: number, fallback: number) =>
  Number.isFinite(value) ? Math.min(maximum, Math.max(minimum, Math.round(value!))) : fallback;

export async function POST(request: Request) {
  const rider = await currentRider(request);
  if (!rider) return Response.json({ error: "Sign in to save recovery check-ins." }, { status: 401 });
  const payload = await request.json() as RecoveryPayload;
  const legFreshness = ["fresh", "normal", "heavy", "dead"].includes(payload.legFreshness ?? "")
    ? payload.legFreshness!
    : "normal";
  const recovery = {
    id: crypto.randomUUID(),
    riderId: rider.id,
    loggedAt: new Date().toISOString(),
    sleepQuality: bounded(payload.sleepQuality, 1, 5, 3),
    legFreshness,
    motivation: bounded(payload.motivation, 1, 5, 3),
    generalSoreness: bounded(payload.soreness, 0, 10, 0),
    kneePain: bounded(payload.kneePain, 0, 10, 0),
  };
  const db = getDb();
  await db.insert(riders).values({ id: rider.id, displayName: rider.name }).onConflictDoNothing();
  await db.insert(recoveryLogs).values(recovery);
  return Response.json({ recovery }, { status: 201 });
}
