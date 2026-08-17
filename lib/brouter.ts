export const BROUTER_VERSION = "1.7.10";
export const BROUTER_PROFILE = "trekking";
export const BROUTER_SEGMENT_BASE_URL = "https://brouter.de/brouter/segments4";

const SEGMENT_DEGREES = 5;
const EARTH_RADIUS_KM = 6_371.0088;

export interface GeoCoordinate {
  latitude: number;
  longitude: number;
}

export interface RoundTripSeed {
  id: string;
  bearingDegrees: number;
  targetDistanceKm: number;
  waypoints: readonly GeoCoordinate[];
  requiredSegments: readonly string[];
}

export interface BRouterRouteCandidate {
  id: string;
  distanceKm: number;
  ascentMeters: number;
  estimatedSeconds: number | null;
  coordinates: readonly (readonly [number, number, number?])[];
}

export interface RoundTripSeedOptions {
  count?: number;
  bearings?: readonly number[];
}

function finiteCoordinate(coordinate: GeoCoordinate) {
  if (!Number.isFinite(coordinate.latitude) || coordinate.latitude < -90 || coordinate.latitude > 90) {
    throw new RangeError("Latitude must be between -90 and 90 degrees.");
  }
  if (!Number.isFinite(coordinate.longitude) || coordinate.longitude < -180 || coordinate.longitude > 180) {
    throw new RangeError("Longitude must be between -180 and 180 degrees.");
  }
  return coordinate;
}

function segmentAxis(value: number, positivePrefix: string, negativePrefix: string) {
  const lowerBoundary = Math.floor(value / SEGMENT_DEGREES) * SEGMENT_DEGREES;
  return `${lowerBoundary < 0 ? negativePrefix : positivePrefix}${Math.abs(lowerBoundary)}`;
}

export function segmentTileName(coordinate: GeoCoordinate) {
  finiteCoordinate(coordinate);
  return `${segmentAxis(coordinate.longitude, "E", "W")}_${segmentAxis(coordinate.latitude, "N", "S")}.rd5`;
}

export function validateSegmentTileName(value: string) {
  const tile = value.trim();
  const match = /^([EW])(\d{1,3})_([NS])(\d{1,2})\.rd5$/.exec(tile);
  if (!match) throw new Error("Regional routing segment is invalid.");
  const longitude = Number(match[2]);
  const latitude = Number(match[4]);
  if (longitude > 180 || latitude > 90 || longitude % SEGMENT_DEGREES !== 0 || latitude % SEGMENT_DEGREES !== 0) {
    throw new Error("Regional routing segment is invalid.");
  }
  return tile;
}

export function segmentDownloadUrlForTile(tile: string) {
  return `${BROUTER_SEGMENT_BASE_URL}/${validateSegmentTileName(tile)}`;
}

export function segmentDownloadUrl(coordinate: GeoCoordinate) {
  return segmentDownloadUrlForTile(segmentTileName(coordinate));
}

export function destinationPoint(start: GeoCoordinate, distanceKm: number, bearingDegrees: number): GeoCoordinate {
  finiteCoordinate(start);
  if (!Number.isFinite(distanceKm) || distanceKm <= 0) throw new RangeError("Distance must be greater than zero.");
  if (!Number.isFinite(bearingDegrees)) throw new RangeError("Bearing must be finite.");

  const angularDistance = distanceKm / EARTH_RADIUS_KM;
  const bearing = bearingDegrees * Math.PI / 180;
  const startLatitude = start.latitude * Math.PI / 180;
  const startLongitude = start.longitude * Math.PI / 180;
  const latitude = Math.asin(
    Math.sin(startLatitude) * Math.cos(angularDistance)
      + Math.cos(startLatitude) * Math.sin(angularDistance) * Math.cos(bearing),
  );
  const longitude = startLongitude + Math.atan2(
    Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(startLatitude),
    Math.cos(angularDistance) - Math.sin(startLatitude) * Math.sin(latitude),
  );

  return {
    latitude: latitude * 180 / Math.PI,
    longitude: ((longitude * 180 / Math.PI + 540) % 360) - 180,
  };
}

export function buildRoundTripSeeds(
  start: GeoCoordinate,
  targetDistanceKm: number,
  options: RoundTripSeedOptions = {},
): RoundTripSeed[] {
  finiteCoordinate(start);
  if (!Number.isFinite(targetDistanceKm) || targetDistanceKm < 5 || targetDistanceKm > 300) {
    throw new RangeError("Target round-trip distance must be between 5 and 300 km.");
  }

  const count = options.count ?? 3;
  if (!Number.isInteger(count) || count < 1 || count > 3) throw new RangeError("BRouter supports one to three candidate seeds.");
  const bearings = options.bearings ?? [0, 120, 240];
  if (bearings.length < count) throw new RangeError("Provide at least one bearing for each requested candidate.");

  const triangleSideKm = targetDistanceKm / 3;
  return bearings.slice(0, count).map((bearing, index) => {
    const normalizedBearing = ((bearing % 360) + 360) % 360;
    const first = destinationPoint(start, triangleSideKm, normalizedBearing);
    const second = destinationPoint(start, triangleSideKm, normalizedBearing + 60);
    const waypoints = [start, first, second, start] as const;
    return {
      id: `candidate-${index + 1}`,
      bearingDegrees: normalizedBearing,
      targetDistanceKm,
      waypoints,
      requiredSegments: [...new Set(waypoints.map(segmentTileName))],
    };
  });
}

export function buildBRouterRequestUrl(baseUrl: string, seed: RoundTripSeed, profile = BROUTER_PROFILE) {
  if (!profile.trim()) throw new Error("A BRouter profile is required.");
  const url = new URL("/brouter", baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
  url.searchParams.set("lonlats", seed.waypoints
    .map((coordinate) => `${coordinate.longitude.toFixed(6)},${coordinate.latitude.toFixed(6)}`)
    .join("|"));
  url.searchParams.set("profile", profile);
  url.searchParams.set("alternativeidx", "0");
  url.searchParams.set("format", "geojson");
  url.searchParams.set("trackname", seed.id);
  return url;
}

function numericProperty(value: unknown, label: string) {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) throw new Error(`BRouter response is missing a valid ${label}.`);
  return numeric;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export function parseBRouterGeoJson(payload: unknown, fallbackId: string): BRouterRouteCandidate {
  const collection = record(payload);
  const features = collection?.features;
  if (!Array.isArray(features) || !features.length) throw new Error("BRouter response contains no route feature.");
  const feature = record(features[0]);
  const properties = record(feature?.properties);
  const geometry = record(feature?.geometry);
  if (!properties || geometry?.type !== "LineString" || !Array.isArray(geometry.coordinates)) {
    throw new Error("BRouter response is not a valid route LineString.");
  }

  const coordinates = geometry.coordinates.map((value) => {
    if (!Array.isArray(value) || value.length < 2) throw new Error("BRouter response contains an invalid route coordinate.");
    const longitude = Number(value[0]);
    const latitude = Number(value[1]);
    const elevation = value.length > 2 ? Number(value[2]) : undefined;
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude) || (elevation !== undefined && !Number.isFinite(elevation))) {
      throw new Error("BRouter response contains a non-numeric route coordinate.");
    }
    return elevation === undefined
      ? [longitude, latitude] as const
      : [longitude, latitude, elevation] as const;
  });
  if (coordinates.length < 2) throw new Error("BRouter route must contain at least two coordinates.");

  const totalTime = Number(properties["total-time"]);
  return {
    id: typeof properties.name === "string" && properties.name.trim() ? properties.name : fallbackId,
    distanceKm: numericProperty(properties["track-length"], "track length") / 1_000,
    ascentMeters: numericProperty(properties["filtered ascend"], "ascent"),
    estimatedSeconds: Number.isFinite(totalTime) ? totalTime : null,
    coordinates,
  };
}
