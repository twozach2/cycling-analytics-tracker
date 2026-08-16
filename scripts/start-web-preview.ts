import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { cpSync, existsSync, mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const previewHost = "127.0.0.1";
const previewWebPort = 5173;
const previewApiPort = 8723;
const directHealthUrl = `http://${previewHost}:${previewApiPort}/api/health`;
const previewUrl = `http://${previewHost}:${previewWebPort}`;
const healthUrl = `${previewUrl}/api/health`;

function defaultPreviewDataDirectory() {
  if (process.platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local");
    return path.join(localAppData, "CyclingAnalyticsPreview");
  }
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", "CyclingAnalyticsPreview");
  }
  const dataHome = process.env.XDG_DATA_HOME ?? path.join(os.homedir(), ".local", "share");
  return path.join(dataHome, "CyclingAnalyticsPreview");
}

const previewDataDirectory = path.resolve(
  process.env.CYCLING_PREVIEW_DATA_DIR?.trim() || defaultPreviewDataDirectory(),
);

function desktopDataDirectory() {
  if (process.platform === "win32") {
    const roamingAppData = process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming");
    return path.join(roamingAppData, "cycling-analytics");
  }
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", "cycling-analytics");
  }
  const configHome = process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), ".config");
  return path.join(configHome, "cycling-analytics");
}

async function seedPreviewFromDesktop() {
  const previewDatabase = path.join(previewDataDirectory, "cycling.sqlite");
  if (existsSync(previewDatabase)) return;

  const desktopDirectory = desktopDataDirectory();
  const desktopDatabase = path.join(desktopDirectory, "cycling.sqlite");
  if (!existsSync(desktopDatabase)) return;

  mkdirSync(previewDataDirectory, { recursive: true });
  const source = new Database(desktopDatabase, { readonly: true, fileMustExist: true });
  try {
    await source.backup(previewDatabase);
  } finally {
    source.close();
  }

  const desktopRideFiles = path.join(desktopDirectory, "ride-files");
  if (existsSync(desktopRideFiles)) {
    cpSync(desktopRideFiles, path.join(previewDataDirectory, "ride-files"), {
      recursive: true,
      force: false,
      errorOnExist: false,
    });
  }
  console.log("Seeded preview rides and preferences from the installed app.");
  console.log("Encrypted Strava credentials were not copied; connect Strava once in the preview if needed.");
}

async function responseText(url: string, timeoutMs = 1_000) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    return response.ok ? await response.text() : null;
  } catch {
    return null;
  }
}

async function isCyclingPreviewReady() {
  const directHealth = await responseText(directHealthUrl);
  try {
    const parsed = JSON.parse(directHealth ?? "null") as { status?: string; mode?: string } | null;
    if (parsed?.status !== "ok" || parsed.mode !== "local") return false;
  } catch {
    return false;
  }

  const [page, health] = await Promise.all([responseText(previewUrl), responseText(healthUrl)]);
  if (!page?.includes("<title>Cycling Analytics</title>")) return false;
  try {
    const parsed = JSON.parse(health ?? "null") as { status?: string; mode?: string } | null;
    return parsed?.status === "ok" && parsed.mode === "local";
  } catch {
    return false;
  }
}

function openPreview() {
  if (process.env.CYCLING_PREVIEW_NO_OPEN === "1") return;

  const opener = process.platform === "win32"
    ? spawn("explorer.exe", [previewUrl], { detached: true, stdio: "ignore" })
    : process.platform === "darwin"
      ? spawn("open", [previewUrl], { detached: true, stdio: "ignore" })
      : spawn("xdg-open", [previewUrl], { detached: true, stdio: "ignore" });
  opener.unref();
}

async function waitForPreview(serviceProcess: ChildProcess, timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isCyclingPreviewReady()) return;
    if (serviceProcess.exitCode !== null) {
      throw new Error(`Preview services stopped with exit code ${serviceProcess.exitCode}.`);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Preview services did not become ready within 45 seconds.");
}

function stopServiceProcess(serviceProcess: ChildProcess) {
  if (!serviceProcess.pid || serviceProcess.exitCode !== null) return;
  if (process.platform === "win32") {
    spawnSync("taskkill.exe", ["/PID", String(serviceProcess.pid), "/T", "/F"], {
      stdio: "ignore",
    });
    return;
  }
  serviceProcess.kill("SIGTERM");
}

async function main() {
  if (await isCyclingPreviewReady()) {
    console.log(`Cycling Analytics Preview is already running at ${previewUrl}`);
    openPreview();
    return;
  }

  await seedPreviewFromDesktop();

  console.log("Starting Cycling Analytics Preview...");
  console.log(`Dashboard: ${previewUrl}`);
  if (await responseText(previewUrl)) {
    console.error(`Port ${previewWebPort} is already serving another page.`);
    console.error("Close the older preview terminal, then launch Cycling Analytics Preview again.");
    process.exitCode = 1;
    return;
  }

  console.log(`Persistent preview data: ${previewDataDirectory}`);
  console.log("Keep this window open while using the preview. Press Ctrl+C to stop it.");

  const serviceCommand = process.platform === "win32"
    ? (process.env.ComSpec || "cmd.exe")
    : "npm";
  const serviceArguments = process.platform === "win32"
    ? ["/d", "/s", "/c", "npm.cmd run dev:preview:services"]
    : ["run", "dev:preview:services"];
  const serviceProcess = spawn(serviceCommand, serviceArguments, {
    cwd: projectRoot,
    env: {
      ...process.env,
      CYCLING_DATA_DIR: previewDataDirectory,
      CYCLING_MIGRATIONS_DIR: path.join(projectRoot, "drizzle"),
      CYCLING_API_PORT: String(previewApiPort),
      PORT: String(previewApiPort),
    },
    stdio: "inherit",
  });

  serviceProcess.once("error", (error) => {
    console.error(`Could not start preview services: ${error.message}`);
    process.exitCode = 1;
  });

  const stopServices = () => stopServiceProcess(serviceProcess);
  process.once("SIGINT", stopServices);
  process.once("SIGTERM", stopServices);

  try {
    await waitForPreview(serviceProcess);
    console.log(`Cycling Analytics Preview is ready at ${previewUrl}`);
    openPreview();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    stopServiceProcess(serviceProcess);
    process.exitCode = 1;
    return;
  }

  await new Promise<void>((resolve) => {
    serviceProcess.once("exit", (code, signal) => {
      if (code && code !== 0) process.exitCode = code;
      if (signal) console.log(`Preview services stopped (${signal}).`);
      process.off("SIGINT", stopServices);
      process.off("SIGTERM", stopServices);
      resolve();
    });
  });
}

void main();
