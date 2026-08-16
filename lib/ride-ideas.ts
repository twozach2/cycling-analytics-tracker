import { RIDE_INTENTION_VERSION, type RideIntention } from "./ride-intentions";

export const RIDE_IDEA_VERSION = "ride-idea-v1";

export type RideIdeaSetting = "indoor" | "outdoor";
export type RideIdeaProvider = "zwift" | "brouter";
export type RideIdeaStatus = "selected" | "completed" | "replaced" | "dismissed";

export type RideIdeaSelection = {
  version: typeof RIDE_IDEA_VERSION;
  dateIso: string;
  setting: RideIdeaSetting;
  route: {
    id: string;
    name: string;
    provider: RideIdeaProvider;
    details: Record<string, string | number | boolean | null>;
  };
  intention: RideIntention;
  thresholds: {
    ftpWatts: number;
    weightKg: number;
    lthrBpm: number | null;
  };
};

export type SavedRideIdea = RideIdeaSelection & {
  id: string;
  status: RideIdeaStatus;
  completedRideId: string | null;
  createdAt: string;
  updatedAt: string;
};

function record(value: unknown, label: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value as Record<string, unknown>;
}

function text(value: unknown, label: string, maximumLength = 1_000) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is required.`);
  if (value.length > maximumLength) throw new Error(`${label} is too long.`);
  return value.trim();
}

function finite(value: unknown, label: string) {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) throw new Error(`${label} must be a finite number.`);
  return number;
}

export function parseRideIdeaDate(value: unknown) {
  const dateIso = text(value, "Ride date", 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) throw new Error("Ride date must use YYYY-MM-DD.");
  const [year, month, day] = dateIso.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month! - 1 || date.getUTCDate() !== day) {
    throw new Error("Ride date is not a real calendar date.");
  }
  return dateIso;
}

function parseDetails(value: unknown) {
  const details = record(value ?? {}, "Route details");
  const parsed: Record<string, string | number | boolean | null> = {};
  for (const [key, detail] of Object.entries(details)) {
    if (!key.trim() || key.length > 80) throw new Error("Route detail keys must be short, non-empty strings.");
    if (detail !== null && typeof detail !== "string" && typeof detail !== "number" && typeof detail !== "boolean") {
      throw new Error("Route details may contain only strings, numbers, booleans, or null.");
    }
    if (typeof detail === "number" && !Number.isFinite(detail)) throw new Error("Route detail numbers must be finite.");
    parsed[key] = detail;
  }
  if (JSON.stringify(parsed).length > 20_000) throw new Error("Route details are too large.");
  return parsed;
}

function parseIntention(value: unknown): RideIntention {
  const intention = record(value, "Ride intention");
  if (intention.version !== RIDE_INTENTION_VERSION) throw new Error("Ride intention version is unsupported.");
  if (!(["rest", "recovery", "endurance", "tempo"] as const).includes(intention.mode as never)) throw new Error("Ride intention mode is invalid.");
  if (intention.disabled !== false) throw new Error("A paused or rest-day idea cannot be saved as today’s ride.");
  const duration = record(intention.duration, "Ride intention duration");
  const targetMinutes = finite(duration.targetMinutes, "Target duration");
  if (![30, 60, 90].includes(targetMinutes)) throw new Error("Target duration must be 30, 60, or 90 minutes.");
  const power = record(intention.power, "Ride intention power");
  const evidence = record(intention.evidence, "Ride intention evidence");
  const lowFtp = finite(power.lowFtp, "Lower power target");
  const highFtp = finite(power.highFtp, "Upper power target");
  if (lowFtp <= 0 || highFtp > 1.5 || lowFtp > highFtp) throw new Error("Ride intention power range is invalid.");
  if (!(["low", "moderate", "high"] as const).includes(evidence.confidence as never)) throw new Error("Ride intention confidence is invalid.");
  if (!Array.isArray(intention.optionalFocusBlocks) || intention.optionalFocusBlocks.length > 6) throw new Error("Ride intention focus blocks are invalid.");
  text(intention.title, "Ride intention title", 200);
  text(intention.primaryCue, "Ride intention cue", 2_000);
  text(evidence.rationale, "Ride intention rationale", 4_000);
  if (JSON.stringify(intention).length > 40_000) throw new Error("Ride intention is too large.");
  return JSON.parse(JSON.stringify(intention)) as RideIntention;
}

export function parseRideIdeaSelection(value: unknown): RideIdeaSelection {
  const payload = record(value, "Ride idea");
  if (payload.version !== RIDE_IDEA_VERSION) throw new Error("Ride idea version is unsupported.");
  if (payload.setting !== "indoor" && payload.setting !== "outdoor") throw new Error("Ride setting is invalid.");
  const route = record(payload.route, "Route");
  const provider = route.provider;
  if (provider !== "zwift" && provider !== "brouter") throw new Error("Route provider is invalid.");
  if ((payload.setting === "indoor" && provider !== "zwift") || (payload.setting === "outdoor" && provider !== "brouter")) {
    throw new Error("Route provider does not match the ride setting.");
  }
  const thresholds = record(payload.thresholds, "Threshold snapshot");
  const ftpWatts = Math.round(finite(thresholds.ftpWatts, "FTP snapshot"));
  const weightKg = finite(thresholds.weightKg, "Weight snapshot");
  const lthrBpm = thresholds.lthrBpm == null ? null : Math.round(finite(thresholds.lthrBpm, "LTHR snapshot"));
  if (ftpWatts < 50 || ftpWatts > 500) throw new Error("FTP snapshot must be between 50 and 500 watts.");
  if (weightKg < 35 || weightKg > 250) throw new Error("Weight snapshot must be between 35 and 250 kilograms.");
  if (lthrBpm !== null && (lthrBpm < 80 || lthrBpm > 220)) throw new Error("LTHR snapshot must be between 80 and 220 bpm.");

  return {
    version: RIDE_IDEA_VERSION,
    dateIso: parseRideIdeaDate(payload.dateIso),
    setting: payload.setting,
    route: {
      id: text(route.id, "Route ID", 200),
      name: text(route.name, "Route name", 300),
      provider,
      details: parseDetails(route.details),
    },
    intention: parseIntention(payload.intention),
    thresholds: { ftpWatts, weightKg, lthrBpm },
  };
}

export function sameRideIdea(left: SavedRideIdea | null, right: RideIdeaSelection) {
  return Boolean(left
    && left.dateIso === right.dateIso
    && left.setting === right.setting
    && left.route.id === right.route.id
    && left.intention.mode === right.intention.mode
    && left.intention.duration.targetMinutes === right.intention.duration.targetMinutes
    && left.thresholds.ftpWatts === right.thresholds.ftpWatts
    && left.thresholds.weightKg === right.thresholds.weightKg
    && left.thresholds.lthrBpm === right.thresholds.lthrBpm);
}
