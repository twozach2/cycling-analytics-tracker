import type { BRouterRouteCandidate } from "./brouter";
import type { CoachConfidence } from "./coach";
import { heartRateCueForMode } from "./heart-rate";
import type { WorkoutMode } from "./phase3";

export const RIDE_INTENTION_VERSION = "ride-intention-v1";

export type RouteCommitment = 30 | 60 | 90;
export type TerrainPreference = "flat" | "rolling" | "climb" | "any";

export type RideIntentionDuration = {
  targetMinutes: RouteCommitment;
  minimumMinutes: number;
  maximumMinutes: number;
};

export type RideFocusBlock = {
  label: string;
  startMinute: number;
  durationMinutes: number;
  lowFtp: number;
  highFtp: number;
  optional: true;
  cue: string;
};

export type RideIntention = {
  version: typeof RIDE_INTENTION_VERSION;
  mode: WorkoutMode;
  title: string;
  duration: RideIntentionDuration;
  power: {
    lowFtp: number;
    highFtp: number;
    lowWatts: number;
    highWatts: number;
    cue: string;
  };
  heartRateCue: string;
  perceivedEffortCue: string;
  primaryCue: string;
  optionalFocusBlocks: readonly RideFocusBlock[];
  terrainPreference: TerrainPreference;
  encouragement: string;
  flexibility: string;
  disabled: boolean;
  evidence: {
    confidence: CoachConfidence;
    rationale: string;
  };
};

export type BuildRideIntentionInput = {
  mode: WorkoutMode;
  commitment: RouteCommitment;
  ftpWatts: number;
  lthrBpm?: number | null;
  confidence?: CoachConfidence;
  evidenceRationale?: string;
};

export type OutdoorRouteChoice = {
  kind: "outdoor";
  id: string;
  name: string;
  route: BRouterRouteCandidate;
  intention: RideIntention;
  estimatedMinutes: number | null;
};

export const RIDE_DURATION_WINDOWS: Record<RouteCommitment, Omit<RideIntentionDuration, "targetMinutes">> = {
  30: { minimumMinutes: 20, maximumMinutes: 40 },
  60: { minimumMinutes: 45, maximumMinutes: 75 },
  90: { minimumMinutes: 75, maximumMinutes: 105 },
};

export const RIDE_INTENSITY_BANDS: Record<WorkoutMode, { low: number; high: number; perceivedEffortCue: string; fallbackHeartRateCue: string }> = {
  rest: { low: 0.45, high: 0.55, perceivedEffortCue: "Optional only · RPE 1–2", fallbackHeartRateCue: "Optional only · RPE 1–2" },
  recovery: { low: 0.5, high: 0.6, perceivedEffortCue: "Very easy · RPE 2–3", fallbackHeartRateCue: "Easy breathing · RPE 2–3" },
  endurance: { low: 0.6, high: 0.72, perceivedEffortCue: "Conversational · RPE 3–4", fallbackHeartRateCue: "Conversational · RPE 3–4" },
  tempo: { low: 0.76, high: 0.88, perceivedEffortCue: "Comfortably strong · RPE 6–7", fallbackHeartRateCue: "Controlled rise · RPE 6–7" },
};

const intentionTitle: Record<WorkoutMode, string> = {
  rest: "Save this idea for another day",
  recovery: "Easy movement",
  endurance: "Aerobic endurance",
  tempo: "Tempo exploration",
};

const terrainPreference: Record<WorkoutMode, TerrainPreference> = {
  rest: "any",
  recovery: "flat",
  endurance: "rolling",
  tempo: "rolling",
};

function focusBlocks(mode: WorkoutMode, commitment: RouteCommitment): RideFocusBlock[] {
  if (mode === "rest" || mode === "recovery") return [];
  if (mode === "endurance") {
    const startMinute = commitment === 30 ? 5 : 10;
    const durationMinutes = commitment === 30 ? 20 : commitment === 60 ? 35 : 55;
    return [{
      label: "Steady aerobic rhythm",
      startMinute,
      durationMinutes,
      lowFtp: RIDE_INTENSITY_BANDS.endurance.low,
      highFtp: RIDE_INTENSITY_BANDS.endurance.high,
      optional: true,
      cue: "Settle around Zone 2 when the terrain cooperates; brief departures are normal.",
    }];
  }

  const blockDuration = commitment === 30 ? 8 : commitment === 60 ? 10 : 15;
  const starts = commitment === 30 ? [10] : commitment === 60 ? [15, 35] : [20, 55];
  return starts.map((startMinute, index) => ({
    label: `Comfortably strong tempo ${index + 1}`,
    startMinute,
    durationMinutes: blockDuration,
    lowFtp: RIDE_INTENSITY_BANDS.tempo.low,
    highFtp: RIDE_INTENSITY_BANDS.tempo.high,
    optional: true,
    cue: "Use a suitable flat or climb, then return to easy riding whenever you like.",
  }));
}

function primaryCue(mode: WorkoutMode, blocks: readonly RideFocusBlock[]) {
  if (mode === "rest") return "Today can be a rest day. Keep this route as something to look forward to.";
  if (mode === "recovery") return "Ride as easily as feels good. Calm breathing and comfortable legs matter more than power.";
  if (mode === "endurance") return `After an easy start, explore roughly ${blocks[0]?.durationMinutes ?? 20} minutes around Zone 2 when the terrain cooperates.`;
  return `Warm up easily, then explore up to ${blocks.length} comfortably strong tempo stretches with easy riding between them.`;
}

export function buildRideIntention(input: BuildRideIntentionInput): RideIntention {
  if (!Number.isFinite(input.ftpWatts) || input.ftpWatts <= 0) throw new Error("A saved FTP is required to build a ride intention.");
  const intensity = RIDE_INTENSITY_BANDS[input.mode];
  const durationWindow = RIDE_DURATION_WINDOWS[input.commitment];
  const blocks = focusBlocks(input.mode, input.commitment);
  const lowWatts = Math.round(input.ftpWatts * intensity.low);
  const highWatts = Math.round(input.ftpWatts * intensity.high);

  return {
    version: RIDE_INTENTION_VERSION,
    mode: input.mode,
    title: intentionTitle[input.mode],
    duration: { targetMinutes: input.commitment, ...durationWindow },
    power: {
      lowFtp: intensity.low,
      highFtp: intensity.high,
      lowWatts,
      highWatts,
      cue: `${lowWatts}–${highWatts} W as a guide, not a score`,
    },
    heartRateCue: heartRateCueForMode(input.mode, input.lthrBpm ?? null) ?? intensity.fallbackHeartRateCue,
    perceivedEffortCue: intensity.perceivedEffortCue,
    primaryCue: primaryCue(input.mode, blocks),
    optionalFocusBlocks: blocks,
    terrainPreference: terrainPreference[input.mode],
    encouragement: "This is an idea, not an assignment. Any ride you choose still counts.",
    flexibility: input.mode === "rest"
      ? "Rest, walk, stretch, or simply revisit this route another day."
      : "Change the effort, shorten the route, skip every focus block, or simply enjoy the scenery.",
    disabled: input.mode === "rest",
    evidence: {
      confidence: input.confidence ?? "low",
      rationale: input.evidenceRationale?.trim() || "Built from today’s coach mode and your saved training thresholds.",
    },
  };
}

export function pairOutdoorRouteCandidates(
  candidates: readonly BRouterRouteCandidate[],
  intention: RideIntention,
): OutdoorRouteChoice[] {
  return candidates.map((route, index) => ({
    kind: "outdoor",
    id: route.id,
    name: `Outdoor loop ${index + 1}`,
    route,
    intention,
    estimatedMinutes: route.estimatedSeconds === null ? null : Math.round(route.estimatedSeconds / 60),
  }));
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function slug(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "ride-intention";
}

export function rideIntentionZwoFilename(routeName: string, intention: RideIntention) {
  return `${slug(routeName)}-${intention.mode}-${intention.duration.targetMinutes}min.zwo`;
}

type ZwoSegment = { durationMinutes: number; lowFtp: number; highFtp: number };

function zwoSegments(intention: RideIntention): ZwoSegment[] {
  if (!intention.optionalFocusBlocks.length) {
    return [{ durationMinutes: intention.duration.targetMinutes, lowFtp: intention.power.lowFtp, highFtp: intention.power.highFtp }];
  }

  const easy = RIDE_INTENSITY_BANDS.recovery;
  const segments: ZwoSegment[] = [];
  let cursor = 0;
  [...intention.optionalFocusBlocks].sort((a, b) => a.startMinute - b.startMinute).forEach((block) => {
    if (block.startMinute > cursor) segments.push({ durationMinutes: block.startMinute - cursor, lowFtp: easy.low, highFtp: easy.high });
    segments.push({ durationMinutes: block.durationMinutes, lowFtp: block.lowFtp, highFtp: block.highFtp });
    cursor = block.startMinute + block.durationMinutes;
  });
  if (cursor < intention.duration.targetMinutes) {
    segments.push({ durationMinutes: intention.duration.targetMinutes - cursor, lowFtp: easy.low, highFtp: easy.high });
  }
  return segments;
}

export function buildRideIntentionZwo(routeName: string, intention: RideIntention) {
  if (intention.disabled) throw new Error("A rest-day intention does not create a structured workout.");
  const description = `${intention.primaryCue} ${intention.flexibility}`;
  const workout = zwoSegments(intention)
    .map((segment) => `      <SteadyState Duration="${Math.round(segment.durationMinutes * 60)}" PowerLow="${segment.lowFtp.toFixed(2)}" PowerHigh="${segment.highFtp.toFixed(2)}" />`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<workout_file>\n  <author>Cycling Analytics</author>\n  <name>${escapeXml(`${routeName} · ${intention.title}`)}</name>\n  <description>${escapeXml(description)}</description>\n  <sportType>bike</sportType>\n  <tags>\n    <tag name="FLEXIBLE" />\n    <tag name="${escapeXml(intention.mode.toUpperCase())}" />\n  </tags>\n  <workout>\n${workout}\n  </workout>\n</workout_file>\n`;
}

export function outdoorRouteGpxFilename(choice: OutdoorRouteChoice) {
  return `${slug(choice.name)}-${choice.intention.duration.targetMinutes}min.gpx`;
}

export function buildOutdoorRouteGpx(choice: OutdoorRouteChoice) {
  if (choice.route.coordinates.length < 2) throw new Error("An outdoor route needs at least two coordinates.");
  const points = choice.route.coordinates.map(([longitude, latitude, elevation]) => (
    `      <trkpt lat="${latitude.toFixed(7)}" lon="${longitude.toFixed(7)}">${elevation === undefined ? "" : `<ele>${elevation.toFixed(1)}</ele>`}</trkpt>`
  )).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Cycling Analytics" xmlns="http://www.topografix.com/GPX/1/1">\n  <metadata><name>${escapeXml(choice.name)}</name><desc>${escapeXml(`${choice.intention.title}: ${choice.intention.primaryCue}`)}</desc></metadata>\n  <trk><name>${escapeXml(choice.name)}</name><type>Cycling</type><trkseg>\n${points}\n    </trkseg></trk>\n</gpx>\n`;
}
