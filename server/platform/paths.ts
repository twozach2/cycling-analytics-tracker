import { mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const APP_DIRECTORY_NAME = "CyclingAnalytics";

function defaultApplicationDataDirectory() {
  if (process.platform === "win32") {
    return process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local");
  }
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support");
  }
  return process.env.XDG_DATA_HOME ?? path.join(os.homedir(), ".local", "share");
}

export function dataDirectory() {
  const configured = process.env.CYCLING_DATA_DIR?.trim();
  const directory = configured
    ? path.resolve(configured)
    : path.join(defaultApplicationDataDirectory(), APP_DIRECTORY_NAME);
  mkdirSync(directory, { recursive: true });
  return directory;
}

export function databasePath() {
  return path.join(dataDirectory(), "cycling.sqlite");
}

export function rideFilesDirectory() {
  const directory = path.join(dataDirectory(), "ride-files");
  mkdirSync(directory, { recursive: true });
  return directory;
}

export function migrationsDirectory() {
  const configured = process.env.CYCLING_MIGRATIONS_DIR?.trim();
  if (configured) return path.resolve(configured);

  const packagedRoot = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  if (packagedRoot) return path.join(packagedRoot, "drizzle");
  return path.resolve(process.cwd(), "drizzle");
}
