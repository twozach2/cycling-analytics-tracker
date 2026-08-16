import assert from "node:assert/strict";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { SafeStorageSecretStore, type AsyncSafeStorage } from "../server/platform/safe-storage-secret-store.ts";
import { STRAVA_SECRETS } from "../server/platform/secret-store.ts";

class FakeSafeStorage implements AsyncSafeStorage {
  available = true;
  shouldReEncrypt = false;
  encryptions = 0;

  async isAsyncEncryptionAvailable() {
    return this.available;
  }

  async encryptStringAsync(plainText: string) {
    this.encryptions += 1;
    const encrypted = Buffer.from(plainText, "utf8");
    for (let index = 0; index < encrypted.length; index += 1) encrypted[index] ^= 0xa5;
    return encrypted;
  }

  async decryptStringAsync(encrypted: Buffer) {
    const decrypted = Buffer.from(encrypted);
    for (let index = 0; index < decrypted.length; index += 1) decrypted[index] ^= 0xa5;
    const result = decrypted.toString("utf8");
    const shouldReEncrypt = this.shouldReEncrypt;
    this.shouldReEncrypt = false;
    return { result, shouldReEncrypt };
  }
}

test("SafeStorageSecretStore encrypts every value and persists across instances", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "cycling-safe-storage-"));
  const filename = path.join(directory, "secrets.json");
  const safeStorage = new FakeSafeStorage();
  const store = new SafeStorageSecretStore(safeStorage, filename);

  try {
    await Promise.all([
      store.set(STRAVA_SECRETS.clientId, "270509"),
      store.set(STRAVA_SECRETS.clientSecret, "client-secret"),
      store.set(STRAVA_SECRETS.accessToken, "access-token"),
      store.set(STRAVA_SECRETS.refreshToken, "refresh-token"),
    ]);
    const raw = await readFile(filename, "utf8");
    assert.match(raw, /electron-safe-storage-v1/);
    assert.doesNotMatch(raw, /client-secret|access-token|refresh-token|270509/);

    const restarted = new SafeStorageSecretStore(safeStorage, filename);
    assert.equal(await restarted.get(STRAVA_SECRETS.clientId), "270509");
    assert.equal(await restarted.get(STRAVA_SECRETS.refreshToken), "refresh-token");

    const beforeRotation = safeStorage.encryptions;
    safeStorage.shouldReEncrypt = true;
    assert.equal(await restarted.get(STRAVA_SECRETS.accessToken), "access-token");
    assert.ok(safeStorage.encryptions > beforeRotation);

    await Promise.all(Object.values(STRAVA_SECRETS).map((name) => restarted.delete(name)));
    await assert.rejects(access(filename));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("SafeStorageSecretStore migrates the Phase 2 plaintext file on first read", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "cycling-safe-storage-migration-"));
  const filename = path.join(directory, "secrets.json");
  const safeStorage = new FakeSafeStorage();
  await writeFile(filename, JSON.stringify({ [STRAVA_SECRETS.clientSecret]: "legacy-secret" }));

  try {
    const store = new SafeStorageSecretStore(safeStorage, filename);
    assert.equal(await store.get(STRAVA_SECRETS.clientSecret), "legacy-secret");
    const migrated = await readFile(filename, "utf8");
    assert.match(migrated, /electron-safe-storage-v1/);
    assert.doesNotMatch(migrated, /legacy-secret/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("SafeStorageSecretStore refuses to persist credentials without OS encryption", async () => {
  const safeStorage = new FakeSafeStorage();
  safeStorage.available = false;
  const store = new SafeStorageSecretStore(safeStorage, path.join(tmpdir(), `cycling-unavailable-${crypto.randomUUID()}.json`));
  await assert.rejects(store.set(STRAVA_SECRETS.clientSecret, "secret"), /encryption is not available/i);
});
