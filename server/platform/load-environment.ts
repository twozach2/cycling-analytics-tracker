import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";

export function loadEnvironmentFiles() {
  for (const filename of [".env", ".env.local"]) {
    if (existsSync(filename)) loadEnvFile(filename);
  }
}
