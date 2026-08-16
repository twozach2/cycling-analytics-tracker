import assert from "node:assert/strict";
import { access, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { FileSecretStore, STRAVA_SECRETS } from "../server/platform/secret-store.ts";

test("FileSecretStore serializes concurrent writes and persists across instances", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "cycling-secrets-"));
  const filename = path.join(directory, "secrets.json");
  const store = new FileSecretStore(filename);

  try {
    await Promise.all([
      store.set(STRAVA_SECRETS.clientId, "270509"),
      store.set(STRAVA_SECRETS.clientSecret, "client-secret"),
      store.set(STRAVA_SECRETS.accessToken, "access-token"),
      store.set(STRAVA_SECRETS.refreshToken, "refresh-token"),
    ]);

    const restarted = new FileSecretStore(filename);
    assert.equal(await restarted.get(STRAVA_SECRETS.clientId), "270509");
    assert.equal(await restarted.get(STRAVA_SECRETS.refreshToken), "refresh-token");
    const stored = JSON.parse(await readFile(filename, "utf8")) as Record<string, string>;
    assert.equal(Object.keys(stored).length, 4);
    if (process.platform !== "win32") assert.equal((await stat(filename)).mode & 0o777, 0o600);

    await Promise.all(Object.values(STRAVA_SECRETS).map((name) => restarted.delete(name)));
    await assert.rejects(access(filename));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("FileSecretStore rejects path-like secret names", async () => {
  const store = new FileSecretStore(path.join(tmpdir(), `cycling-secret-${crypto.randomUUID()}.json`));
  await assert.rejects(store.set("../escape", "nope"), /Invalid secret name/);
});
