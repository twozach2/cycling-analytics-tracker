import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { once } from "node:events";
import test from "node:test";
import { normalizeFtpEffectiveDate } from "../server/services/ftp-history.ts";
import { closeDb } from "../server/platform/db.ts";
import { startServer } from "../server/index.ts";

test("FTP effective dates are normalized without accepting invalid or future dates", () => {
  const now = new Date("2026-08-16T18:00:00.000Z");
  assert.equal(normalizeFtpEffectiveDate("2026-05-01", now), "2026-05-01T00:00:00.000Z");
  assert.throws(() => normalizeFtpEffectiveDate("2026-02-30", now), /valid effective date/);
  assert.throws(() => normalizeFtpEffectiveDate("2026-08-17", now), /cannot start in the future/);
});

test("dated FTP edits recalculate only rides in the affected historical range", async () => {
  const dataDirectory = await mkdtemp(path.join(tmpdir(), "cycling-ftp-history-"));
  process.env.CYCLING_DATA_DIR = dataDirectory;
  process.env.CYCLING_MIGRATIONS_DIR = path.resolve("drizzle");
  const server = startServer(0);
  await once(server, "listening");
  const address = server.address();
  assert(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`;
  const json = (method: string, body: unknown) => ({ method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

  try {
    const profile = await fetch(`${origin}/api/phase3`, json("POST", { action: "record_profile", ftpWatts: 200, weightPounds: 200 }));
    assert.equal(profile.status, 201);

    for (const ride of [
      { name: "Old ride", startedAt: "2026-06-01T12:00:00.000Z" },
      { name: "Newer ride", startedAt: "2026-08-10T12:00:00.000Z" },
    ]) {
      const response = await fetch(`${origin}/api/rides`, json("POST", {
        ...ride, source: "manual", movingTimeS: 3600, elapsedTimeS: 3600,
        averagePowerWatts: 140, normalizedPowerWatts: 150, averageHeartRateBpm: 130,
        rideType: "Zone 2", environment: "indoor", rideContext: "ordinary",
      }));
      assert.equal(response.status, 201);
    }

    const added = await fetch(`${origin}/api/ftp-history`, json("POST", {
      effectiveDate: "2026-07-01", ftpWatts: 160, notes: "Known summer FTP",
    }));
    assert.equal(added.status, 201);
    const addedPayload = await added.json() as { entries: Array<{ id: string; effectiveAt: string; affectedRideCount: number }>; coverage: { historicalRides: number; uncoveredRides: number }; currentFtpWatts: number };
    const historical = addedPayload.entries.find((entry) => entry.effectiveAt.startsWith("2026-07-01"));
    assert(historical);
    assert.equal(historical.affectedRideCount, 1);
    assert.equal(addedPayload.coverage.historicalRides, 1);
    assert.equal(addedPayload.coverage.uncoveredRides, 1);
    assert.equal(addedPayload.currentFtpWatts, 200);

    let rideLogResponse = await fetch(`${origin}/api/rides`);
    let rideLog = await rideLogResponse.json() as { rides: Array<{ ride: { name: string; ftpAtRideWatts: number; ftpSnapshotSource: string; normalizedPowerWatts: number }; metrics: { intensityFactor: number; trainingLoad: number } }> };
    const oldRide = rideLog.rides.find((row) => row.ride.name === "Old ride");
    let newerRide = rideLog.rides.find((row) => row.ride.name === "Newer ride");
    assert.equal(oldRide?.ride.ftpAtRideWatts, 200);
    assert.equal(oldRide?.ride.ftpSnapshotSource, "current_at_import");
    assert.equal(newerRide?.ride.ftpAtRideWatts, 160);
    assert.equal(newerRide?.ride.ftpSnapshotSource, "ftp_history");
    assert.equal(newerRide?.ride.normalizedPowerWatts, 150);
    assert.equal(newerRide?.metrics.intensityFactor, 0.938);
    assert.equal(newerRide?.metrics.trainingLoad, 88);

    const edited = await fetch(`${origin}/api/ftp-history`, json("PATCH", {
      id: historical.id, effectiveDate: "2026-07-01", ftpWatts: 180, notes: "Corrected from training log",
    }));
    assert.equal(edited.status, 200);
    rideLogResponse = await fetch(`${origin}/api/rides`);
    rideLog = await rideLogResponse.json() as typeof rideLog;
    newerRide = rideLog.rides.find((row) => row.ride.name === "Newer ride");
    assert.equal(newerRide?.ride.ftpAtRideWatts, 180);
    assert.equal(newerRide?.ride.normalizedPowerWatts, 150);
    assert.equal(newerRide?.metrics.intensityFactor, 0.833);
    assert.equal(newerRide?.metrics.trainingLoad, 69.4);

    const coversOldest = await fetch(`${origin}/api/ftp-history`, json("POST", { effectiveDate: "2026-05-01", ftpWatts: 150 }));
    assert.equal(coversOldest.status, 201);
    const coveredPayload = await coversOldest.json() as { entries: Array<{ id: string; effectiveAt: string }>; coverage: { historicalRides: number; uncoveredRides: number } };
    assert.equal(coveredPayload.coverage.historicalRides, 2);
    assert.equal(coveredPayload.coverage.uncoveredRides, 0);
    const oldestEntry = coveredPayload.entries.find((entry) => entry.effectiveAt.startsWith("2026-05-01"));
    assert(oldestEntry);

    const removed = await fetch(`${origin}/api/ftp-history`, json("DELETE", { id: oldestEntry.id }));
    assert.equal(removed.status, 200);
    const duplicate = await fetch(`${origin}/api/ftp-history`, json("POST", { effectiveDate: "2026-07-01", ftpWatts: 175 }));
    assert.equal(duplicate.status, 409);

    const stateResponse = await fetch(`${origin}/api/ftp-history`);
    const state = await stateResponse.json() as { entries: Array<{ id: string }> };
    for (const entry of state.entries.slice(0, -1)) {
      const response = await fetch(`${origin}/api/ftp-history`, json("DELETE", { id: entry.id }));
      assert.equal(response.status, 200);
    }
    const finalState = await (await fetch(`${origin}/api/ftp-history`)).json() as { entries: Array<{ id: string }> };
    const protectedDelete = await fetch(`${origin}/api/ftp-history`, json("DELETE", { id: finalState.entries[0].id }));
    assert.equal(protectedDelete.status, 409);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    closeDb();
    delete process.env.CYCLING_DATA_DIR;
    delete process.env.CYCLING_MIGRATIONS_DIR;
    await rm(dataDirectory, { recursive: true, force: true });
  }
});
