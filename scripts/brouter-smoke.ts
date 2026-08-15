import { spawn } from "node:child_process";
import { mkdir, readdir, stat } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { buildRoundTripSeeds, type RoundTripSeed } from "../lib/brouter";
import {
  BRouterClient,
  BRouterError,
  brouterLaunchArguments,
  ensureRegionalSegment,
} from "../server/services/brouter";

const PUBLIC_BENCHMARK_START = { latitude: 39.7475, longitude: -104.9506 };

function option(name: string, fallback?: string) {
  const inline = process.argv.find((argument) => argument.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

async function findServerJar(brouterRoot: string) {
  const directory = path.join(brouterRoot, "brouter-server", "build", "libs");
  const files = await readdir(directory);
  const jar = files.find((name) => name.endsWith("-all.jar"));
  if (!jar) throw new Error(`No BRouter fat JAR was found in ${directory}. Build :brouter-server:fatJar first.`);
  return path.join(directory, jar);
}

async function waitForPort(port: number, processExited: Promise<never>, timeoutMs = 15_000) {
  const startedAt = performance.now();
  while (performance.now() - startedAt < timeoutMs) {
    const connected = await Promise.race([
      new Promise<boolean>((resolve) => {
        const socket = net.createConnection({ host: "127.0.0.1", port });
        socket.once("connect", () => { socket.destroy(); resolve(true); });
        socket.once("error", () => resolve(false));
        socket.setTimeout(500, () => { socket.destroy(); resolve(false); });
      }),
      processExited,
    ]);
    if (connected) return performance.now() - startedAt;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`BRouter did not listen on port ${port} within ${timeoutMs} ms.`);
}

async function directoryBytes(directory: string) {
  let total = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    total += entry.isDirectory() ? await directoryBytes(entryPath) : (await stat(entryPath)).size;
  }
  return total;
}

async function main() {
  const brouterRoot = path.resolve(option("--brouter-root") ?? "");
  if (!option("--brouter-root")) throw new Error("Pass --brouter-root with a pinned BRouter source checkout.");
  const port = Number(option("--port", "17778"));
  const javaExecutable = option("--java", "java")!;
  const dataDirectory = path.resolve(option("--data-dir", path.join(os.tmpdir(), "cycling-brouter-smoke"))!);
  const segmentDirectory = path.join(dataDirectory, "segments4");
  const customProfileDirectory = path.join(dataDirectory, "customprofiles");
  const profileDirectory = path.join(brouterRoot, "misc", "profiles2");
  const jarPath = await findServerJar(brouterRoot);
  await mkdir(customProfileDirectory, { recursive: true });

  const downloadStarted = performance.now();
  const segment = await ensureRegionalSegment(PUBLIC_BENCHMARK_START, segmentDirectory);
  const segmentDownloadMs = performance.now() - downloadStarted;
  const arguments_ = brouterLaunchArguments({ jarPath, segmentDirectory, profileDirectory, customProfileDirectory, port });
  const server = spawn(javaExecutable, arguments_, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  let serverError = "";
  server.stderr.setEncoding("utf8");
  server.stderr.on("data", (chunk: string) => { serverError += chunk; });
  const processExited = new Promise<never>((_resolve, reject) => {
    server.once("error", reject);
    server.once("exit", (code) => reject(new Error(`BRouter exited before readiness with code ${code}. ${serverError}`)));
  });

  try {
    const startupMs = await waitForPort(port, processExited);
    const client = new BRouterClient(`http://127.0.0.1:${port}`);
    const seeds = buildRoundTripSeeds(PUBLIC_BENCHMARK_START, 30, { bearings: [0, 45, 90] });
    const routes = [];
    for (const seed of seeds) {
      const started = performance.now();
      const route = await client.route(seed);
      routes.push({
        id: route.id,
        latencyMs: Math.round(performance.now() - started),
        distanceKm: Math.round(route.distanceKm * 10) / 10,
        ascentMeters: Math.round(route.ascentMeters),
      });
    }

    const missingTileSeed: RoundTripSeed = {
      id: "missing-tile",
      bearingDegrees: 270,
      targetDistanceKm: 10,
      waypoints: [
        { latitude: 39.75, longitude: -105.22 },
        { latitude: 39.78, longitude: -105.18 },
        { latitude: 39.75, longitude: -105.22 },
      ],
      requiredSegments: ["W110_N35.rd5"],
    };
    const failureStarted = performance.now();
    let missingTileFailure: { code: string; segment?: string; latencyMs: number } | null = null;
    try {
      await client.route(missingTileSeed);
    } catch (error) {
      if (!(error instanceof BRouterError) || error.code !== "missing_segment") throw error;
      missingTileFailure = {
        code: error.code,
        segment: error.details.segment,
        latencyMs: Math.round(performance.now() - failureStarted),
      };
    }
    if (!missingTileFailure) throw new Error("Missing regional data did not produce the expected typed failure.");

    const jarBytes = (await stat(jarPath)).size;
    const profileBytes = await directoryBytes(profileDirectory);
    console.log(JSON.stringify({
      platform: process.platform,
      architecture: process.arch,
      javaExecutable,
      startupMs: Math.round(startupMs),
      segment: {
        tile: segment.tile,
        bytes: segment.bytes,
        cached: segment.cached,
        downloadMs: Math.round(segmentDownloadMs),
      },
      package: { jarBytes, profileBytes },
      routes,
      missingTileFailure,
    }, null, 2));
  } finally {
    server.kill();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
