import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { once } from "node:events";
import test from "node:test";
import { closeDb } from "../server/platform/db.ts";
import { startServer } from "../server/index.ts";

test("the local service persists a profile, imported file, and ride across restarts", async () => {
  const dataDirectory = await mkdtemp(path.join(tmpdir(), "cycling-analytics-"));
  process.env.CYCLING_DATA_DIR = dataDirectory;
  process.env.CYCLING_MIGRATIONS_DIR = path.resolve("drizzle");

  let server = startServer(0);
  await once(server, "listening");
  let address = server.address();
  assert(address && typeof address === "object");
  let origin = `http://127.0.0.1:${address.port}`;

  try {
    const health = await fetch(`${origin}/api/health`);
    assert.deepEqual(await health.json(), { status: "ok", mode: "local" });

    const profile = await fetch(`${origin}/api/phase3`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "record_profile", ftpWatts: 165, weightPounds: 275 }),
    });
    assert.equal(profile.status, 201);

    const gpx = "<gpx version=\"1.1\"><trk><name>Local test</name></trk></gpx>";
    const form = new FormData();
    form.set("file", new File([gpx], "local-test.gpx", { type: "application/gpx+xml" }));
    const imported = await fetch(`${origin}/api/import`, { method: "POST", body: form });
    assert.equal(imported.status, 201);
    const importResult = await imported.json() as { sourceFile: { id: string } };

    const saved = await fetch(`${origin}/api/rides`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sourceFileId: importResult.sourceFile.id,
        source: "gpx",
        name: "Local persistence test",
        startedAt: "2026-08-08T18:00:00.000Z",
        movingTimeS: 3600,
        elapsedTimeS: 3600,
        averagePowerWatts: 120,
        averageHeartRateBpm: 125,
        rideType: "Zone 2",
        environment: "indoor",
      }),
    });
    assert.equal(saved.status, 201);

    const sha = createHash("sha256").update(gpx).digest("hex");
    await access(path.join(dataDirectory, "ride-files", "local-rider", `${sha}.gpx`));

    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    closeDb();

    server = startServer(0);
    await once(server, "listening");
    address = server.address();
    assert(address && typeof address === "object");
    origin = `http://127.0.0.1:${address.port}`;
    const rides = await fetch(`${origin}/api/rides`);
    const rideLog = await rides.json() as { rides: Array<{ ride: { name: string } }> };
    assert.equal(rideLog.rides.length, 1);
    assert.equal(rideLog.rides[0]?.ride.name, "Local persistence test");
  } finally {
    if (server.listening) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    closeDb();
    delete process.env.CYCLING_DATA_DIR;
    delete process.env.CYCLING_MIGRATIONS_DIR;
    await rm(dataDirectory, { recursive: true, force: true });
  }
});
