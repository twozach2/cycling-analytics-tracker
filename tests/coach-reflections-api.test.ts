import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { eq } from "drizzle-orm";
import { coachReflections, rideIdeas, rideMetrics, rides } from "../db/schema.ts";
import { buildRideIntention } from "../lib/ride-intentions.ts";
import type { RideIdeaSelection } from "../lib/ride-ideas.ts";
import { closeDb, getDb } from "../server/platform/db.ts";
import { startServer } from "../server/index.ts";

const selection: RideIdeaSelection = {
  version: "ride-idea-v1",
  dateIso: "2026-08-17",
  setting: "indoor",
  route: { id: "tempus-fugit", name: "Tempus Fugit", provider: "zwift", details: { world: "Watopia" } },
  intention: buildRideIntention({ mode: "endurance", commitment: 60, ftpWatts: 165, lthrBpm: 166, confidence: "moderate" }),
  thresholds: { ftpWatts: 165, weightKg: 124.7, lthrBpm: 166 },
};

test("the local API links, persists, and returns an auditable reflection idempotently", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "cycling-coach-reflections-"));
  process.env.CYCLING_DATA_DIR = directory;
  process.env.CYCLING_MIGRATIONS_DIR = path.resolve("drizzle");
  const server = startServer(0);
  await once(server, "listening");
  const address = server.address();
  assert(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`;

  try {
    const savedIdea = await fetch(`${origin}/api/ride-ideas`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(selection),
    });
    assert.equal(savedIdea.status, 201);

    const db = getDb();
    await db.insert(rides).values({
      id: "ride-1",
      riderId: "local-rider",
      source: "zwift",
      name: "Zwift - Tempus Fugit in Watopia",
      startedAt: "2026-08-17T17:00:00.000Z",
      rideType: "Zone 2",
      rideTypeSource: "automatic",
      classificationConfidence: "high",
      classificationReason: "Steady aerobic ride.",
      classificationVersion: "test",
      indoor: true,
      environment: "virtual",
      routeName: "Tempus Fugit",
      movingTimeS: 3_480,
      averagePowerWatts: 108,
      normalizedPowerWatts: 112,
      normalizedPowerSource: "recorded",
      averageHeartRateBpm: 142,
      averageCadenceRpm: 86,
    });
    await db.insert(rideMetrics).values({
      rideId: "ride-1",
      intensityFactor: 0.68,
      trainingLoad: 42,
      dataQuality: "high",
      algorithmVersion: "test",
    });

    const first = await fetch(`${origin}/api/coach-reflections`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dateIso: "2026-08-17" }),
    });
    assert.equal(first.status, 201);
    const firstPayload = await first.json() as {
      reflection: { rideId: string; matchConfidence: string; adaptation: { nextMode: string }; createdAt: string };
      rideIdea: { status: string; completedRideId: string };
      history: unknown[];
    };
    assert.equal(firstPayload.reflection.rideId, "ride-1");
    assert.equal(firstPayload.reflection.matchConfidence, "high");
    assert.equal(firstPayload.reflection.adaptation.nextMode, "recovery");
    assert.equal(firstPayload.rideIdea.status, "completed");
    assert.equal(firstPayload.rideIdea.completedRideId, "ride-1");
    assert.equal(firstPayload.history.length, 1);

    const repeated = await fetch(`${origin}/api/coach-reflections`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dateIso: "2026-08-17" }),
    });
    assert.equal(repeated.status, 200);
    const repeatedPayload = await repeated.json() as { reflection: { createdAt: string }; history: unknown[] };
    assert.equal(repeatedPayload.reflection.createdAt, firstPayload.reflection.createdAt);
    assert.equal(repeatedPayload.history.length, 1);

    const [persistedIdea] = await db.select().from(rideIdeas).where(eq(rideIdeas.completedRideId, "ride-1"));
    const persistedReflections = await db.select().from(coachReflections);
    assert.equal(persistedIdea?.status, "completed");
    assert.equal(persistedReflections.length, 1);
    assert.match(persistedReflections[0]!.adaptationSummary, /flexible/i);

    const replacement = { ...selection, route: { ...selection.route, id: "tick-tock", name: "Tick Tock" } };
    const replaced = await fetch(`${origin}/api/ride-ideas`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(replacement),
    });
    assert.equal(replaced.status, 201);
    await db.update(rideIdeas).set({ updatedAt: "2026-08-17T20:00:00.000Z" }).where(eq(rideIdeas.riderId, "local-rider"));
    const revisedAttempt = await fetch(`${origin}/api/coach-reflections`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dateIso: "2026-08-17" }),
    });
    const revisedPayload = await revisedAttempt.json() as { reflection: unknown; history: unknown[]; candidates: unknown[]; awaitingReason: string };
    assert.equal(revisedPayload.reflection, null);
    assert.equal(revisedPayload.history.length, 1);
    assert.equal(revisedPayload.candidates.length, 1);
    assert.match(revisedPayload.awaitingReason, /before this version/i);
    assert.equal((await db.select().from(coachReflections)).length, 1);
  } finally {
    if (server.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
    closeDb();
    delete process.env.CYCLING_DATA_DIR;
    delete process.env.CYCLING_MIGRATIONS_DIR;
    await rm(directory, { recursive: true, force: true });
  }
});
