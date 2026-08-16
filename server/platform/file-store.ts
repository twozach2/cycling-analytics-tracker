import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { rideFilesDirectory } from "./paths";

type StoredValue = ArrayBuffer | ArrayBufferView | string;

function safePath(key: string) {
  const root = rideFilesDirectory();
  const target = path.resolve(root, key.replaceAll("\\", "/"));
  const relative = path.relative(root, target);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Invalid ride-file key.");
  }
  return target;
}

class LocalStoredObject {
  constructor(private readonly bytes: Buffer) {}

  async text() {
    return this.bytes.toString("utf8");
  }

  async arrayBuffer() {
    return this.bytes.buffer.slice(
      this.bytes.byteOffset,
      this.bytes.byteOffset + this.bytes.byteLength,
    );
  }
}

export class LocalFileStore {
  async put(key: string, value: StoredValue, options?: unknown) {
    void options;
    const target = safePath(key);
    await mkdir(path.dirname(target), { recursive: true });
    const temporary = `${target}.${crypto.randomUUID()}.tmp`;
    const bytes = typeof value === "string"
      ? Buffer.from(value)
      : value instanceof ArrayBuffer
        ? Buffer.from(value)
        : Buffer.from(value.buffer, value.byteOffset, value.byteLength);
    await writeFile(temporary, bytes);
    await rename(temporary, target);
  }

  async get(key: string) {
    try {
      return new LocalStoredObject(await readFile(safePath(key)));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }
}

let store: LocalFileStore | null = null;

export function getFileStore() {
  store ??= new LocalFileStore();
  return store;
}
