import { BRouterClient, BRouterError } from "../services/brouter";
import {
  parseOutdoorRouteRequest,
  type OutdoorRouteAvailability,
  type OutdoorRouteError,
  type OutdoorRouteResponse,
} from "../../lib/outdoor-routes";

type RouteClient = Pick<BRouterClient, "roundTrips">;

export type OutdoorRouteDependencies = {
  environment?: NodeJS.ProcessEnv;
  createClient?: (baseUrl: string) => RouteClient;
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

export function GET(_request: Request, dependencies: OutdoorRouteDependencies = {}) {
  return Response.json(outdoorRouteAvailability(dependencies.environment));
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
