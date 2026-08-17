import { BRouterClient, BRouterError, clearRegionalSegments, ensureRegionalSegmentByTile, regionalSegmentSummary, type RegionalSegmentResult, type RegionalSegmentSummary } from "../services/brouter";
import {
  parseOutdoorSegmentDownloadRequest,
  parseOutdoorRouteRequest,
  type OutdoorRouteAvailability,
  type OutdoorRouteError,
  type OutdoorRouteResponse,
} from "../../lib/outdoor-routes";
import { validateSegmentTileName } from "../../lib/brouter";
import { brouterSegmentsDirectory } from "../platform/paths";

type RouteClient = Pick<BRouterClient, "roundTrips">;

export type OutdoorRouteDependencies = {
  environment?: NodeJS.ProcessEnv;
  createClient?: (baseUrl: string) => RouteClient;
  segmentDirectory?: string;
  summarizeSegments?: (directory: string) => Promise<RegionalSegmentSummary>;
  ensureSegment?: (segment: string, directory: string) => Promise<RegionalSegmentResult>;
  clearSegments?: (directory: string) => Promise<{ removedSegments: number; removedBytes: number }>;
};

function configuredBaseUrl(environment: NodeJS.ProcessEnv) {
  return environment.CYCLING_BROUTER_URL?.trim() ?? "";
}

export function outdoorRouteAvailability(environment: NodeJS.ProcessEnv = process.env): OutdoorRouteAvailability {
  const baseUrl = configuredBaseUrl(environment);
  if (!baseUrl) {
    return {
      status: "not_configured",
      engine: "brouter",
      localOnly: true,
      canGenerate: false,
      message: "Outdoor loop generation is not installed yet. Indoor route ideas remain fully available.",
    };
  }

  try {
    new BRouterClient(baseUrl);
  } catch {
    return {
      status: "not_configured",
      engine: "brouter",
      localOnly: true,
      canGenerate: false,
      message: "The configured route engine must use a private loopback address.",
    };
  }

  return {
    status: "ready",
    engine: "brouter",
    localOnly: true,
    canGenerate: true,
    message: "The local BRouter engine is configured. Route coordinates stay on this device.",
  };
}

function dataDirectory(dependencies: OutdoorRouteDependencies) {
  return dependencies.segmentDirectory ?? brouterSegmentsDirectory();
}

async function dataSummary(dependencies: OutdoorRouteDependencies) {
  return (dependencies.summarizeSegments ?? regionalSegmentSummary)(dataDirectory(dependencies));
}

export async function GET(_request: Request, dependencies: OutdoorRouteDependencies = {}) {
  return Response.json({ ...outdoorRouteAvailability(dependencies.environment), regionalData: await dataSummary(dependencies) });
}

function errorResponse(payload: OutdoorRouteError, status: number) {
  return Response.json(payload, { status });
}

export async function POST(request: Request, dependencies: OutdoorRouteDependencies = {}) {
  const environment = dependencies.environment ?? process.env;
  const availability = outdoorRouteAvailability(environment);
  if (!availability.canGenerate) {
    return errorResponse({ error: availability.message, code: "not_configured" }, 503);
  }

  let input;
  try {
    input = parseOutdoorRouteRequest(await request.json());
  } catch (error) {
    return errorResponse({
      error: error instanceof Error ? error.message : "The outdoor route request is invalid.",
      code: "invalid_request",
    }, 400);
  }

  try {
    const baseUrl = configuredBaseUrl(environment);
    const client = dependencies.createClient?.(baseUrl) ?? new BRouterClient(baseUrl);
    const candidates = await client.roundTrips(input.start, input.targetDistanceKm, { count: 3 });
    const payload: OutdoorRouteResponse = { engine: "brouter", localOnly: true, candidates };
    return Response.json(payload);
  } catch (error) {
    if (error instanceof BRouterError) {
      const status = error.code === "timeout" ? 504 : error.code === "missing_segment" ? 409 : error.code === "unavailable" ? 503 : 502;
      return errorResponse({
        error: error.message,
        code: error.code,
        ...(error.details.segment ? { requiredSegment: error.details.segment } : {}),
      }, status);
    }
    return errorResponse({ error: "The local route engine could not generate route choices.", code: "routing_failed" }, 502);
  }
}

export async function PUT(request: Request, dependencies: OutdoorRouteDependencies = {}) {
  const availability = outdoorRouteAvailability(dependencies.environment);
  if (!availability.canGenerate) return errorResponse({ error: availability.message, code: "not_configured" }, 503);
  let input;
  try {
    input = parseOutdoorSegmentDownloadRequest(await request.json());
    validateSegmentTileName(input.segment);
  } catch (error) {
    return errorResponse({ error: error instanceof Error ? error.message : "The regional map request is invalid.", code: "invalid_request" }, 400);
  }
  try {
    const segment = await (dependencies.ensureSegment ?? ensureRegionalSegmentByTile)(input.segment, dataDirectory(dependencies));
    return Response.json({ segment, regionalData: await dataSummary(dependencies) });
  } catch (error) {
    if (error instanceof BRouterError) return errorResponse({ error: error.message, code: error.code }, 502);
    return errorResponse({ error: "Regional routing data could not be downloaded.", code: "download_failed" }, 502);
  }
}

export async function DELETE(_request: Request, dependencies: OutdoorRouteDependencies = {}) {
  const removed = await (dependencies.clearSegments ?? clearRegionalSegments)(dataDirectory(dependencies));
  return Response.json({ ...removed, regionalData: await dataSummary(dependencies) });
}
