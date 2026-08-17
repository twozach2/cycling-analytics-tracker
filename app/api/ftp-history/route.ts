import { and, eq, lte } from "drizzle-orm";
import { getDb } from "../../../db";
import { ftpHistory, riderGoals } from "../../../db/schema";
import { currentRider } from "../../../lib/current-rider";
import { loadFtpHistoryState, normalizeFtpEffectiveDate, recalculateFtpDependentRideMetrics } from "../../../server/services/ftp-history";

type FtpMutation = { id?: string; effectiveDate?: string; ftpWatts?: number; notes?: string };

async function payloadFor(request: Request): Promise<FtpMutation | null> {
  try {
    return await request.json() as FtpMutation;
  } catch {
    return null;
  }
}

function validatedFtp(value: unknown) {
  const ftpWatts = Math.round(Number(value));
  if (!Number.isFinite(ftpWatts) || ftpWatts < 50 || ftpWatts > 500) throw new Error("FTP must be between 50 and 500 watts.");
  return ftpWatts;
}

function validatedNotes(value: unknown) {
  const notes = typeof value === "string" ? value.trim() : "";
  if (notes.length > 500) throw new Error("Keep the note under 500 characters.");
  return notes;
}

async function responseAfterMutation(riderId: string, status = 200) {
  const recalculation = await recalculateFtpDependentRideMetrics(riderId);
  if (recalculation.currentFtpWatts !== null) {
    await getDb().update(riderGoals).set({ status: "achieved", achievedAt: new Date().toISOString() })
      .where(and(eq(riderGoals.riderId, riderId), eq(riderGoals.status, "active"), lte(riderGoals.targetFtpWatts, recalculation.currentFtpWatts)));
  }
  return Response.json({ ...(await loadFtpHistoryState(riderId)), updatedRides: recalculation.updatedRides }, { status });
}

export async function GET(request: Request) {
  const rider = await currentRider(request);
  return Response.json(await loadFtpHistoryState(rider.id));
}

export async function POST(request: Request) {
  const rider = await currentRider(request);
  const payload = await payloadFor(request);
  if (!payload) return Response.json({ error: "Enter a valid FTP history entry." }, { status: 400 });
  try {
    const effectiveAt = normalizeFtpEffectiveDate(payload.effectiveDate ?? "");
    const ftpWatts = validatedFtp(payload.ftpWatts);
    const notes = validatedNotes(payload.notes);
    const db = getDb();
    const entries = await db.select({ effectiveAt: ftpHistory.effectiveAt }).from(ftpHistory).where(eq(ftpHistory.riderId, rider.id));
    if (entries.some((entry) => entry.effectiveAt.slice(0, 10) === effectiveAt.slice(0, 10))) {
      return Response.json({ error: "An FTP entry already exists for that date. Edit that entry instead." }, { status: 409 });
    }
    await db.insert(ftpHistory).values({
      id: crypto.randomUUID(), riderId: rider.id, effectiveAt, ftpWatts,
      source: "historical correction", notes,
    });
    return responseAfterMutation(rider.id, 201);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "The FTP entry could not be saved." }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  const rider = await currentRider(request);
  const payload = await payloadFor(request);
  const id = payload?.id?.trim();
  if (!payload || !id) return Response.json({ error: "Choose an FTP entry to edit." }, { status: 400 });
  try {
    const effectiveAt = normalizeFtpEffectiveDate(payload.effectiveDate ?? "");
    const ftpWatts = validatedFtp(payload.ftpWatts);
    const notes = validatedNotes(payload.notes);
    const db = getDb();
    const entries = await db.select({ id: ftpHistory.id, effectiveAt: ftpHistory.effectiveAt }).from(ftpHistory).where(eq(ftpHistory.riderId, rider.id));
    if (!entries.some((entry) => entry.id === id)) return Response.json({ error: "FTP entry not found." }, { status: 404 });
    if (entries.some((entry) => entry.id !== id && entry.effectiveAt.slice(0, 10) === effectiveAt.slice(0, 10))) {
      return Response.json({ error: "An FTP entry already exists for that date." }, { status: 409 });
    }
    await db.update(ftpHistory).set({ effectiveAt, ftpWatts, notes, source: "historical correction" })
      .where(and(eq(ftpHistory.id, id), eq(ftpHistory.riderId, rider.id)));
    return responseAfterMutation(rider.id);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "The FTP entry could not be updated." }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const rider = await currentRider(request);
  const payload = await payloadFor(request);
  const id = payload?.id?.trim();
  if (!id) return Response.json({ error: "Choose an FTP entry to remove." }, { status: 400 });
  const db = getDb();
  const entries = await db.select({ id: ftpHistory.id }).from(ftpHistory).where(eq(ftpHistory.riderId, rider.id));
  if (!entries.some((entry) => entry.id === id)) return Response.json({ error: "FTP entry not found." }, { status: 404 });
  if (entries.length === 1) return Response.json({ error: "Keep at least one FTP entry so the current rider profile remains valid." }, { status: 409 });
  await db.delete(ftpHistory).where(and(eq(ftpHistory.id, id), eq(ftpHistory.riderId, rider.id)));
  return responseAfterMutation(rider.id);
}
