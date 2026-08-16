import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { dataDirectory } from "./paths";

export interface SecretStore {
  get(name: string): Promise<string | null>;
  set(name: string, value: string): Promise<void>;
  delete(name: string): Promise<void>;
}

export const STRAVA_SECRETS = {
  clientId: "strava.clientId",
  clientSecret: "strava.clientSecret",
  accessToken: "strava.accessToken",
  refreshToken: "strava.refreshToken",
} as const;

type SecretRecord = Record<string, string>;

function validateName(name: string) {
  if (!/^[a-z0-9._-]+$/i.test(name)) throw new Error("Invalid secret name.");
}

export class FileSecretStore implements SecretStore {
  private mutations: Promise<void> = Promise.resolve();

  constructor(private readonly configuredPath?: string) {}

  private filename() {
    return this.configuredPath ?? path.join(dataDirectory(), "secrets.json");
  }

  private async readSecrets(): Promise<SecretRecord> {
    try {
      const parsed = JSON.parse(await readFile(this.filename(), "utf8")) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("The local secret store is not a JSON object.");
      }
      const entries = Object.entries(parsed);
      if (entries.some(([, value]) => typeof value !== "string")) {
        throw new Error("The local secret store contains an invalid value.");
      }
      return Object.fromEntries(entries) as SecretRecord;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
      throw error;
    }
  }

  private async writeSecrets(secrets: SecretRecord) {
    const filename = this.filename();
    if (Object.keys(secrets).length === 0) {
      await rm(filename, { force: true });
      return;
    }

    await mkdir(path.dirname(filename), { recursive: true });
    const temporary = `${filename}.${crypto.randomUUID()}.tmp`;
    try {
      await writeFile(temporary, `${JSON.stringify(secrets, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
      await rename(temporary, filename);
      await chmod(filename, 0o600);
    } catch (error) {
      await rm(temporary, { force: true });
      throw error;
    }
  }

  private mutate(change: (secrets: SecretRecord) => void) {
    const mutation = this.mutations.then(async () => {
      const secrets = await this.readSecrets();
      change(secrets);
      await this.writeSecrets(secrets);
    });
    this.mutations = mutation.catch(() => undefined);
    return mutation;
  }

  async get(name: string) {
    validateName(name);
    await this.mutations;
    return (await this.readSecrets())[name] ?? null;
  }

  async set(name: string, value: string) {
    validateName(name);
    await this.mutate((secrets) => { secrets[name] = value; });
  }

  async delete(name: string) {
    validateName(name);
    await this.mutate((secrets) => { delete secrets[name]; });
  }
}

let activeStore: SecretStore | null = null;

export function getSecretStore() {
  activeStore ??= new FileSecretStore();
  return activeStore;
}

export function setSecretStore(store: SecretStore) {
  activeStore = store;
}
