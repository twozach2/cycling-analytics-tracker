import { createWriteStream } from "node:fs";
import { mkdir, readdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { pipeline } from "node:stream/promises";
import {
  BROUTER_PROFILE,
  buildBRouterRequestUrl,
  buildRoundTripSeeds,
  parseBRouterGeoJson,
  segmentDownloadUrlForTile,
  segmentTileName,
  validateSegmentTileName,
  type BRouterRouteCandidate,
  type GeoCoordinate,
  type RoundTripSeed,
  type RoundTripSeedOptions,
} from "../../lib/brouter";

export type BRouterErrorCode = "unavailable" | "timeout" | "missing_segment" | "routing_failed" | "invalid_response" | "download_failed";

export class BRouterError extends Error {
  constructor(
    public readonly code: BRouterErrorCode,
    message: string,
    public readonly details: { status?: number; segment?: string } = {},
  ) {
    super(message);
    this.name = "BRouterError";
  }
}

export interface BRouterClientOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  profile?: string;
}

export class BRouterClient {
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly profile: string;

  constructor(private readonly baseUrl: string, options: BRouterClientOptions = {}) {
    const endpoint = new URL(baseUrl);
    if (endpoint.protocol !== "http:" || !["127.0.0.1", "[::1]"].includes(endpoint.hostname)) {
      throw new Error("BRouter must use an explicit loopback HTTP address.");
    }
    if (!Number.isFinite(options.timeoutMs ?? 30_000) || (options.timeoutMs ?? 30_000) <= 0) throw new RangeError("BRouter timeout must be positive.");
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.profile = options.profile ?? BROUTER_PROFILE;
  }

  async route(seed: RoundTripSeed): Promise<BRouterRouteCandidate> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    let body: string;
    try {
      response = await this.fetchImpl(buildBRouterRequestUrl(this.baseUrl, seed, this.profile), { signal: controller.signal });
      body = await response.text();
    } catch (error) {
      if (controller.signal.aborted) throw new BRouterError("timeout", `BRouter did not respond within ${this.timeoutMs} ms.`);
      throw new BRouterError("unavailable", error instanceof Error ? `BRouter is unavailable: ${error.message}` : "BRouter is unavailable.");
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      const missing = /datafile\s+([^\s]+\.rd5)\s+not found/i.exec(body);
      if (missing) {
        throw new BRouterError("missing_segment", `Regional routing data ${missing[1]} is required.`, {
          status: response.status,
          segment: missing[1],
        });
      }
      throw new BRouterError("routing_failed", body.trim() || `BRouter request failed with status ${response.status}.`, { status: response.status });
    }

    try {
      return parseBRouterGeoJson(JSON.parse(body), seed.id);
    } catch (error) {
      throw new BRouterError("invalid_response", error instanceof Error ? error.message : "BRouter returned invalid GeoJSON.");
    }
  }

  async roundTrips(
    start: GeoCoordinate,
    targetDistanceKm: number,
    options: RoundTripSeedOptions = {},
  ): Promise<BRouterRouteCandidate[]> {
    const candidates: BRouterRouteCandidate[] = [];
    for (const seed of buildRoundTripSeeds(start, targetDistanceKm, options)) {
      candidates.push(await this.route(seed));
    }
    return candidates;
  }
}

export interface RegionalSegmentResult {
  tile: string;
  filePath: string;
  sourceUrl: string;
  bytes: number;
  cached: boolean;
}

export interface RegionalSegmentSummary {
  segments: Array<{ name: string; bytes: number }>;
  totalBytes: number;
}

async function existingFileSize(filePath: string) {
  try {
    const details = await stat(filePath);
    return details.isFile() ? details.size : 0;
  } catch {
    return 0;
  }
}

export async function ensureRegionalSegment(
  coordinate: GeoCoordinate,
  segmentDirectory: string,
  fetchImpl: typeof fetch = fetch,
): Promise<RegionalSegmentResult> {
  return ensureRegionalSegmentByTile(segmentTileName(coordinate), segmentDirectory, fetchImpl);
}

export async function ensureRegionalSegmentByTile(
  requestedTile: string,
  segmentDirectory: string,
  fetchImpl: typeof fetch = fetch,
): Promise<RegionalSegmentResult> {
  const tile = validateSegmentTileName(requestedTile);
  const sourceUrl = segmentDownloadUrlForTile(tile);
  await mkdir(segmentDirectory, { recursive: true });
  const filePath = path.join(segmentDirectory, tile);
  const cachedBytes = await existingFileSize(filePath);
  if (cachedBytes > 0) return { tile, filePath, sourceUrl, bytes: cachedBytes, cached: true };

  let response: Response;
  try {
    response = await fetchImpl(sourceUrl);
  } catch (error) {
    throw new BRouterError("download_failed", error instanceof Error ? `Regional data download failed: ${error.message}` : "Regional data download failed.");
  }
  if (!response.ok || !response.body) {
    throw new BRouterError("download_failed", `Regional data download failed with status ${response.status}.`, { status: response.status });
  }

  const partialPath = `${filePath}.partial-${process.pid}-${Date.now()}`;
  try {
    await pipeline(
      Readable.fromWeb(response.body as unknown as NodeReadableStream),
      createWriteStream(partialPath, { flags: "wx" }),
    );
    const bytes = await existingFileSize(partialPath);
    if (!bytes) throw new Error("Regional data download was empty.");
    try {
      await rename(partialPath, filePath);
    } catch (error) {
      const winningDownloadBytes = await existingFileSize(filePath);
      if (!winningDownloadBytes) throw error;
      await rm(partialPath, { force: true });
      return { tile, filePath, sourceUrl, bytes: winningDownloadBytes, cached: true };
    }
    return { tile, filePath, sourceUrl, bytes, cached: false };
  } catch (error) {
    await rm(partialPath, { force: true });
    throw error instanceof BRouterError
      ? error
      : new BRouterError("download_failed", error instanceof Error ? error.message : "Regional data download failed.");
  }
}

export async function regionalSegmentSummary(segmentDirectory: string): Promise<RegionalSegmentSummary> {
  await mkdir(segmentDirectory, { recursive: true });
  const segments: RegionalSegmentSummary["segments"] = [];
  for (const name of await readdir(segmentDirectory)) {
    try {
      validateSegmentTileName(name);
    } catch {
      continue;
    }
    const details = await stat(path.join(segmentDirectory, name));
    if (details.isFile() && details.size > 0) segments.push({ name, bytes: details.size });
  }
  segments.sort((left, right) => left.name.localeCompare(right.name));
  return { segments, totalBytes: segments.reduce((total, segment) => total + segment.bytes, 0) };
}

export async function clearRegionalSegments(segmentDirectory: string) {
  const before = await regionalSegmentSummary(segmentDirectory);
  for (const segment of before.segments) await rm(path.join(segmentDirectory, segment.name), { force: true });
  return { removedSegments: before.segments.length, removedBytes: before.totalBytes };
}

export interface BRouterLaunchOptions {
  jarPath: string;
  segmentDirectory: string;
  profileDirectory: string;
  customProfileDirectory: string;
  port: number;
  maxThreads?: number;
  maxRunningSeconds?: number;
  bindAddress?: string;
}

export function brouterJavaExecutable(runtimeDirectory: string, platform: NodeJS.Platform = process.platform) {
  return path.join(runtimeDirectory, "bin", platform === "win32" ? "java.exe" : "java");
}

export function brouterLaunchArguments(options: BRouterLaunchOptions) {
  if (!Number.isInteger(options.port) || options.port < 1 || options.port > 65_535) throw new RangeError("BRouter port is invalid.");
  return [
    "-Xmx128M",
    "-Xms128M",
    "-Xmn8M",
    `-DmaxRunningTime=${options.maxRunningSeconds ?? 30}`,
    "-DuseRFCMimeType=true",
    "-cp",
    options.jarPath,
    "btools.server.RouteServer",
    options.segmentDirectory,
    options.profileDirectory,
    options.customProfileDirectory,
    String(options.port),
    String(options.maxThreads ?? 1),
    options.bindAddress ?? "127.0.0.1",
  ];
}
