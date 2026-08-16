import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { once } from "node:events";
import test from "node:test";
import { buildRideIntention } from "../lib/ride-intentions.ts";
import { parseRideIdeaSelection, sameRideIdea, type RideIdeaSelection } from "../lib/ride-ideas.ts";
import { closeDb } from "../server/platform/db.ts";
import { startServer } from "../server/index.ts";

function selection(routeId = "tempus-fugit"): RideIdeaSelection {
  return {
    version: "ride-idea-v1",
    dateIso: "2026-08-16",
    setting: "indoor",
    route: {
      id: routeId,
      name: routeId === "tempus-fugit" ? "Tempus Fugit" : "Tick Tock",
      provider: "zwift",
      details: { world: "Watopia", distanceMiles: 12.2, elevationFeet: 105 },
    },
    intention: buildRideIntention({ mode: "endurance", commitment: 60, ftpWatts: 165, lthrBpm: 166, confidence: "moderate" }),
    thresholds: { ftpWatts: 165, weightKg: 124.7, lthrBpm: 166 },
  };
}

test("validates an auditable ride idea and rejects mismatched or paused routes", () => {
  const parsed = parseRideIdeaSelection(selection());
  assert.equal(parsed.route.provider, "zwift");
  assert.equal(parsed.intention.version, "ride-intention-v1");
  assert.throws(() => parseRideIdeaSelection({ ...selection(), setting: "outdoor" }), /does not match/i);
  assert.throws(() => parseRideIdeaSelection({ ...selection(), dateIso: "2026-02-30" }), /real calendar date/i);
  assert.throws(() => parseRideIdeaSelection({
    ...selection(),
    intention: buildRideIntention({ mode: "rest", commitment: 30, ftpWatts: 165 }),
  }), /rest-day idea/i);
});

test("compares the rider-significant parts of a saved idea", () => {
  const current = selection();
  const saved = {
    ...current,
    id: "idea-1",
    status: "selected" as const,
    completedRideId: null,
    createdAt: "2026-08-16T12:00:00.000Z",
    updatedAt: "2026-08-16T12:00:00.000Z",
  };
  assert.equal(sameRideIdea(saved, current), true);
  assert.equal(sameRideIdea(saved, selection("tick-tock")), false);
});

test("the local API persists one replaceable idea per rider and date", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "cycling-ride-ideas-"));
  process.env.CYCLING_DATA_DIR = directory;
  process.env.CYCLING_MIGRATIONS_DIR = path.resolve("drizzle");
  const server = startServer(0);
  await once(server, "listening");
  const address = server.address();
  assert(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`;

  try {
    const empty = await fetch(`${origin}/api/ride-ideas?date=2026-08-16`);
    assert.equal(empty.status, 200);
    assert.deepEqual(await empty.json(), { rideIdea: null });

    const first = await fetch(`${origin}/api/ride-ideas`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(selection()),
    });
    assert.equal(first.status, 201);
    const firstIdea = (await first.json() as { rideIdea: { id: string; route: { id: string }; thresholds: { ftpWatts: number } } }).rideIdea;
    assert.equal(firstIdea.route.id, "tempus-fugit");
    assert.equal(firstIdea.thresholds.ftpWatts, 165);

    const updated = await fetch(`${origin}/api/ride-ideas`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(selection("tick-tock")),
    });
    const updatedIdea = (await updated.json() as { rideIdea: { id: string; route: { id: string } } }).rideIdea;
    assert.equal(updated.status, 201);
    assert.equal(updatedIdea.id, firstIdea.id);
    assert.equal(updatedIdea.route.id, "tick-tock");

    const loaded = await fetch(`${origin}/api/ride-ideas?date=2026-08-16`);
    assert.equal((await loaded.json() as { rideIdea: { route: { id: string } } }).rideIdea.route.id, "tick-tock");
  } finally {
    if (server.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
    closeDb();
    delete process.env.CYCLING_DATA_DIR;
    delete process.env.CYCLING_MIGRATIONS_DIR;
    await rm(directory, { recursive: true, force: true });
  }
});
