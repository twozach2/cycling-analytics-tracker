import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { dataDirectory } from "./paths";
import type { SecretStore } from "./secret-store";

export interface AsyncSafeStorage {
  isAsyncEncryptionAvailable(): Promise<boolean>;
  encryptStringAsync(plainText: string): Promise<Buffer>;
  decryptStringAsync(encrypted: Buffer): Promise<{ result: string; shouldReEncrypt: boolean }>;
}

type SecretRecord = Record<string, string>;
type EncryptedEnvelope = {
  format: "electron-safe-storage-v1";
  values: SecretRecord;
};

function validateName(name: string) {
  if (!/^[a-z0-9._-]+$/i.test(name)) throw new Error("Invalid secret name.");
}

function isStringRecord(value: unknown): value is SecretRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
    && Object.values(value as Record<string, unknown>).every((entry) => typeof entry === "string");
}

export class SafeStorageSecretStore implements SecretStore {
  private operations: Promise<void> = Promise.resolve();

  constructor(
    private readonly storage: AsyncSafeStorage,
    private readonly configuredPath?: string,
  ) {}

  private filename() {
    return this.configuredPath ?? path.join(dataDirectory(), "secrets.json");
  }

  private runExclusive<T>(operation: () => Promise<T>) {
    const result = this.operations.then(operation);
    this.operations = result.then(() => undefined, () => undefined);
    return result;
  }

  private async requireEncryption() {
    if (!await this.storage.isAsyncEncryptionAvailable()) {
      throw new Error("Operating-system credential encryption is not available.");
    }
  }

  private async readStored(): Promise<{ legacy: boolean; values: SecretRecord }> {
    try {
      const parsed = JSON.parse(await readFile(this.filename(), "utf8")) as unknown;
      if (isStringRecord(parsed)) return { legacy: true, values: parsed };
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("The encrypted secret store is not a JSON object.");
      }
      const envelope = parsed as Partial<EncryptedEnvelope>;
      if (envelope.format !== "electron-safe-storage-v1" || !isStringRecord(envelope.values)) {
        throw new Error("The encrypted secret store has an unsupported format.");
      }
      return { legacy: false, values: envelope.values };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return { legacy: false, values: {} };
      throw error;
    }
  }

  private async writeEncrypted(secrets: SecretRecord) {
    const filename = this.filename();
    if (Object.keys(secrets).length === 0) {
      await rm(filename, { force: true });
      return;
    }

    await this.requireEncryption();
    const encryptedEntries = await Promise.all(Object.entries(secrets).map(async ([name, value]) => (
      [name, (await this.storage.encryptStringAsync(value)).toString("base64")] as const
    )));
    const envelope: EncryptedEnvelope = {
      format: "electron-safe-storage-v1",
      values: Object.fromEntries(encryptedEntries),
    };

    await mkdir(path.dirname(filename), { recursive: true });
    const temporary = `${filename}.${crypto.randomUUID()}.tmp`;
    try {
      await writeFile(temporary, `${JSON.stringify(envelope, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
      await rename(temporary, filename);
      await chmod(filename, 0o600);
    } catch (error) {
      await rm(temporary, { force: true });
      throw error;
    }
  }

  private async readPlainSecrets() {
    const stored = await this.readStored();
    if (stored.legacy) {
      await this.writeEncrypted(stored.values);
      return stored.values;
    }
    if (Object.keys(stored.values).length === 0) return {};

    await this.requireEncryption();
    let shouldReEncrypt = false;
    const decryptedEntries = await Promise.all(Object.entries(stored.values).map(async ([name, encoded]) => {
      const decrypted = await this.storage.decryptStringAsync(Buffer.from(encoded, "base64"));
      shouldReEncrypt ||= decrypted.shouldReEncrypt;
      return [name, decrypted.result] as const;
    }));
    const secrets = Object.fromEntries(decryptedEntries) as SecretRecord;
    if (shouldReEncrypt) await this.writeEncrypted(secrets);
    return secrets;
  }

  async get(name: string) {
    validateName(name);
    return this.runExclusive(async () => (await this.readPlainSecrets())[name] ?? null);
  }

  async set(name: string, value: string) {
    validateName(name);
    await this.runExclusive(async () => {
      const secrets = await this.readPlainSecrets();
      secrets[name] = value;
      await this.writeEncrypted(secrets);
    });
  }

  async delete(name: string) {
    validateName(name);
    await this.runExclusive(async () => {
      const secrets = await this.readPlainSecrets();
      delete secrets[name];
      await this.writeEncrypted(secrets);
    });
  }
}
