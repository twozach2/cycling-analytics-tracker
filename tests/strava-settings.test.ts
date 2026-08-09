import assert from "node:assert/strict";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { once } from "node:events";
import test from "node:test";
import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { externalConnections, riders } from "../db/schema.ts";
import * as stravaSync from "../app/api/integrations/strava/sync/route.ts";
import { closeDb, getDb } from "../server/platform/db.ts";
import { FileSecretStore, setSecretStore, STRAVA_SECRETS } from "../server/platform/secret-store.ts";
import { startServer } from "../server/index.ts";

test("Strava settings never return the secret and DELETE wipes secrets plus connection metadata", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "cycling-settings-"));
  const secretsPath = path.join(directory, "secrets.json");
  process.env.CYCLING_DATA_DIR = directory;
  process.env.CYCLING_MIGRATIONS_DIR = path.resolve("drizzle");
  const store = new FileSecretStore(secretsPath);
  setSecretStore(store);
  const server = startServer(0);
  await once(server, "listening");
  const address = server.address();
  assert(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`;

  try {
    const invalid = await fetch(`${origin}/api/settings/strava`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ clientId: "270509" }),
    });
    assert.equal(invalid.status, 400);

    const saved = await fetch(`${origin}/api/settings/strava`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ clientId: "270509", clientSecret: "client-secret" }),
    });
    assert.equal(saved.status, 200);

    const loaded = await fetch(`${origin}/api/settings/strava`);
    const settings = await loaded.json() as Record<string, unknown>;
    assert.deepEqual(settings.configured, true);
    assert.equal(settings.clientId, "270509");
    assert.equal("clientSecret" in settings, false);

    await Promise.all([
      store.set(STRAVA_SECRETS.accessToken, "access-token"),
      store.set(STRAVA_SECRETS.refreshToken, "refresh-token"),
    ]);
    const db = getDb();
    await db.insert(riders).values({ id: "local-rider", displayName: "Local rider" }).onConflictDoNothing();
    await db.insert(externalConnections).values({
      id: crypto.randomUUID(),
      riderId: "local-rider",
      provider: "strava",
      externalAthleteId: "123",
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
    });

    const removed = await fetch(`${origin}/api/settings/strava`, { method: "DELETE" });
    assert.equal(removed.status, 200);
    await assert.rejects(access(secretsPath));
    assert.equal((await db.select().from(externalConnections).where(eq(externalConnections.riderId, "local-rider"))).length, 0);

    await new Promise<void>((resolve) => server.close(() => resolve()));
    closeDb();
    const sqlite = new Database(path.join(directory, "cycling.sqlite"), { readonly: true });
    const columns = sqlite.prepare("PRAGMA table_info(external_connections)").all() as Array<{ name: string }>;
    sqlite.close();
    assert.equal(columns.some((column) => column.name === "access_token" || column.name === "refresh_token"), false);
    assert.equal((await readFile(path.join(directory, "cycling.sqlite"))).byteLength > 0, true);
  } finally {
    if (server.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
    closeDb();
    delete process.env.CYCLING_DATA_DIR;
    delete process.env.CYCLING_MIGRATIONS_DIR;
    await rm(directory, { recursive: true, force: true });
  }
});

test("Strava token rotation persists only through SecretStore", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "cycling-token-rotation-"));
  const secretsPath = path.join(directory, "secrets.json");
  process.env.CYCLING_DATA_DIR = directory;
  process.env.CYCLING_MIGRATIONS_DIR = path.resolve("drizzle");
  const store = new FileSecretStore(secretsPath);
  setSecretStore(store);
  const originalFetch = globalThis.fetch;

  try {
    await Promise.all([
      store.set(STRAVA_SECRETS.clientId, "270509"),
      store.set(STRAVA_SECRETS.clientSecret, "client-secret"),
      store.set(STRAVA_SECRETS.accessToken, "expired-access"),
      store.set(STRAVA_SECRETS.refreshToken, "old-refresh"),
    ]);
    const db = getDb();
    await db.insert(riders).values({
      id: "local-rider",
      displayName: "Local rider",
      defaultFtpWatts: 165,
      defaultWeightKg: 124.7,
    });
    const connectionId = crypto.randomUUID();
    await db.insert(externalConnections).values({
      id: connectionId,
      riderId: "local-rider",
      provider: "strava",
      externalAthleteId: "123",
      expiresAt: 1,
    });

    globalThis.fetch = async (input) => {
      const url = String(input);
      if (url === "https://www.strava.com/oauth/token") {
        return Response.json({ access_token: "rotated-access", refresh_token: "rotated-refresh", expires_at: 2_000_000_000 });
      }
      if (url.startsWith("https://www.strava.com/api/v3/athlete/activities")) {
        return Response.json([]);
      }
      throw new Error(`Unexpected test fetch: ${url}`);
    };

    const response = await stravaSync.POST(new Request("http://127.0.0.1:8722/api/integrations/strava/sync", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: "new" }),
    }));
    assert.equal(response.status, 200);
    const restarted = new FileSecretStore(secretsPath);
    assert.equal(await restarted.get(STRAVA_SECRETS.accessToken), "rotated-access");
    assert.equal(await restarted.get(STRAVA_SECRETS.refreshToken), "rotated-refresh");
    const [connection] = await db.select().from(externalConnections).where(eq(externalConnections.id, connectionId));
    assert.equal(connection?.expiresAt, 2_000_000_000);
    const stored = await readFile(secretsPath, "utf8");
    assert.doesNotMatch(stored, /expired-access|old-refresh/);
  } finally {
    globalThis.fetch = originalFetch;
    closeDb();
    delete process.env.CYCLING_DATA_DIR;
    delete process.env.CYCLING_MIGRATIONS_DIR;
    await rm(directory, { recursive: true, force: true });
  }
});
