import type { BRouterRouteCandidate, GeoCoordinate } from "./brouter";

export type OutdoorRoutingStatus = "not_configured" | "ready";
export type OutdoorRouteEngineErrorCode = "unavailable" | "timeout" | "missing_segment" | "routing_failed" | "invalid_response" | "download_failed";

export type OutdoorRouteAvailability = {
  status: OutdoorRoutingStatus;
  engine: "brouter";
  localOnly: true;
  canGenerate: boolean;
  message: string;
};

export type OutdoorRouteRequest = {
  start: GeoCoordinate;
  targetDistanceKm: number;
};

export type OutdoorRouteResponse = {
  engine: "brouter";
  localOnly: true;
  candidates: BRouterRouteCandidate[];
};

export type OutdoorRouteError = {
  error: string;
  code: "invalid_request" | "not_configured" | OutdoorRouteEngineErrorCode;
  requiredSegment?: string;
};

function finiteNumber(value: unknown, label: string) {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) throw new Error(`${label} must be a finite number.`);
  return number;
}

export function parseOutdoorRouteRequest(value: unknown): OutdoorRouteRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Outdoor route request must be an object.");
  const record = value as Record<string, unknown>;
  const start = record.start;
  if (!start || typeof start !== "object" || Array.isArray(start)) throw new Error("A starting coordinate is required.");
  const coordinate = start as Record<string, unknown>;
  const latitude = finiteNumber(coordinate.latitude, "Latitude");
  const longitude = finiteNumber(coordinate.longitude, "Longitude");
  const targetDistanceKm = finiteNumber(record.targetDistanceKm, "Target distance");
  if (latitude < -90 || latitude > 90) throw new Error("Latitude must be between -90 and 90 degrees.");
  if (longitude < -180 || longitude > 180) throw new Error("Longitude must be between -180 and 180 degrees.");
  if (targetDistanceKm < 5 || targetDistanceKm > 300) throw new Error("Target distance must be between 5 and 300 km.");
  return { start: { latitude, longitude }, targetDistanceKm };
}
