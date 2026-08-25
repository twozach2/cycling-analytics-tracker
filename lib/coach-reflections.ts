import type { CoachConfidence, CoachMode } from "./coach";
import type { SavedRideIdea } from "./ride-ideas";
import { localDayKey } from "./shared/date";

export const COACH_REFLECTION_VERSION = "coach-reflection-v1";
export const COACH_ADAPTATION_VERSION = "coach-adaptation-v1";

export type ReflectionDataQuality = "low" | "moderate" | "high";

export type ReflectionRide = {
  id: string;
  name: string;
  routeName: string | null;
  startedAt: string;
  environment: "virtual" | "indoor" | "outdoor";
  trainingType: string;
  movingTimeSeconds: number;
  trainingLoad: number;
  intensityFactor: number;
  averagePowerWatts: number | null;
  normalizedPowerWatts: number | null;
  averageHeartRateBpm: number | null;
  averageCadenceRpm: number | null;
  dataQuality: ReflectionDataQuality;
};

export type ReflectionCandidate = Pick<ReflectionRide, "id" | "name" | "routeName" | "startedAt" | "environment" | "trainingType" | "movingTimeSeconds">;

export type RideIdeaMatch = {
  ride: ReflectionRide | null;
  confidence: CoachConfidence | null;
  rationale: string;
  candidates: ReflectionCandidate[];
};

export type CoachAdaptation = {
  version: typeof COACH_ADAPTATION_VERSION;
  beforeMode: CoachMode;
  nextMode: CoachMode;
  summary: string;
  reasons: string[];
};

export type CoachIntentionReflection = {
  version: typeof COACH_REFLECTION_VERSION;
  rideIdeaId: string;
  rideId: string;
  dateIso: string;
  routeName: string;
  rideName: string;
  setting: SavedRideIdea["setting"];
  intentionTitle: string;
  intentionMode: CoachMode;
  matchConfidence: CoachConfidence;
  evidenceConfidence: CoachConfidence;
  matchRationale: string;
  headline: string;
  summary: string;
  encouragement: string;
  observations: Array<{ label: string; value: string; detail: string }>;
  whatMatched: string[];
  whatVaried: string[];
  limitations: string[];
  adaptation: CoachAdaptation;
  createdAt: string;
};

const hardTypes = new Set(["Tempo", "Sweet Spot", "Threshold", "VO2", "Sprint", "FTP Test"]);
const normalized = (value: string | null | undefined) => (value ?? "")
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

function routeMatches(idea: SavedRideIdea, ride: ReflectionRide) {
  const expected = [idea.route.name, idea.route.id].map(normalized).filter((value) => value.length >= 4);
  const observed = [ride.routeName, ride.name].map(normalized).filter(Boolean);
  return expected.some((expectedValue) => observed.some((observedValue) => observedValue.includes(expectedValue) || expectedValue.includes(observedValue)));
}

function settingMatches(idea: SavedRideIdea, ride: ReflectionRide) {
  return idea.setting === "indoor" ? ride.environment === "indoor" || ride.environment === "virtual" : ride.environment === "outdoor";
}

const candidate = (ride: ReflectionRide): ReflectionCandidate => ({
  id: ride.id,
  name: ride.name,
  routeName: ride.routeName,
  startedAt: ride.startedAt,
  environment: ride.environment,
  trainingType: ride.trainingType,
  movingTimeSeconds: ride.movingTimeSeconds,
});

export function matchRideIdea(idea: SavedRideIdea, rides: readonly ReflectionRide[]): RideIdeaMatch {
  const sameDay = rides.filter((ride) => {
    const started = new Date(ride.startedAt);
    return Number.isFinite(started.getTime()) && localDayKey(started) === idea.dateIso;
  });
  const ideaRevisionTime = Date.parse(idea.updatedAt);
  const afterIdeaWasSaved = sameDay.filter((ride) => !Number.isFinite(ideaRevisionTime) || Date.parse(ride.startedAt) >= ideaRevisionTime);
  const sameSetting = afterIdeaWasSaved.filter((ride) => settingMatches(idea, ride));
  if (!sameSetting.length) {
    return {
      ride: null,
      confidence: null,
      rationale: sameDay.length > afterIdeaWasSaved.length
        ? "A ride exists on this date, but it began before this version of the idea was saved. The app will not link it automatically."
        : sameDay.length
        ? `A ride was recorded on ${idea.dateIso}, but its indoor/outdoor setting does not match the saved idea.`
        : `No completed ride is recorded for ${idea.dateIso} yet.`,
      candidates: sameDay.map(candidate),
    };
  }

  const routeMatchesForDay = sameSetting.filter((ride) => routeMatches(idea, ride));
  if (routeMatchesForDay.length === 1) {
    return {
      ride: routeMatchesForDay[0]!,
      confidence: "high",
      rationale: "The ride date, setting, and recorded route/name agree with the saved idea.",
      candidates: sameSetting.map(candidate),
    };
  }
  if (sameSetting.length === 1) {
    return {
      ride: sameSetting[0]!,
      confidence: "moderate",
      rationale: "This is the only ride on the saved date with the same indoor/outdoor setting; route naming was not used as proof.",
      candidates: sameSetting.map(candidate),
    };
  }
  return {
    ride: null,
    confidence: null,
    rationale: "Several rides share the saved date and setting, so the app will not guess which one belongs to this idea.",
    candidates: sameSetting.map(candidate),
  };
}

function confidenceFor(match: CoachConfidence, quality: ReflectionDataQuality): CoachConfidence {
  if (match === "low" || quality === "low") return "low";
  if (match === "high" && quality === "high") return "high";
  return "moderate";
}

function durationObservation(idea: SavedRideIdea, minutes: number) {
  const { minimumMinutes, maximumMinutes, targetMinutes } = idea.intention.duration;
  if (minutes < minimumMinutes) return {
    relation: "shorter" as const,
    value: `${minutes} min · shorter than the ${minimumMinutes}–${maximumMinutes} min idea`,
    detail: `You chose ${minimumMinutes - minutes} fewer minutes than the lower edge. A shorter ride can still be exactly the useful choice.`,
  };
  if (minutes > maximumMinutes) return {
    relation: "longer" as const,
    value: `${minutes} min · longer than the ${minimumMinutes}–${maximumMinutes} min idea`,
    detail: `The ride continued ${minutes - maximumMinutes} minutes beyond the broad window, adding more volume than the saved idea anticipated.`,
  };
  return {
    relation: "within" as const,
    value: `${minutes} min · within the ${minimumMinutes}–${maximumMinutes} min idea`,
    detail: `The ride landed near the saved ${targetMinutes}-minute time commitment without requiring exact timing.`,
  };
}

function effortObservation(idea: SavedRideIdea, ride: ReflectionRide) {
  const observed = ride.normalizedPowerWatts && ride.normalizedPowerWatts > 0
    ? { watts: ride.normalizedPowerWatts, label: "normalized power" }
    : ride.averagePowerWatts && ride.averagePowerWatts > 0
      ? { watts: ride.averagePowerWatts, label: "average power" }
      : null;
  if (!observed) return {
    relation: "unknown" as const,
    value: "Power comparison unavailable",
    detail: "The reflection keeps the saved effort cue visible but will not infer intensity without recorded power.",
  };
  const rounded = Math.round(observed.watts);
  if (observed.watts < idea.intention.power.lowWatts) return {
    relation: "easier" as const,
    value: `${rounded} W ${observed.label} · gentler than the saved guide`,
    detail: "Coasting, terrain, stops, or simply choosing an easier day can lower ride-level power. That is context—not a missed assignment.",
  };
  if (observed.watts > idea.intention.power.highWatts) return {
    relation: "harder" as const,
    value: `${rounded} W ${observed.label} · stronger than the saved guide`,
    detail: "Terrain, group dynamics, or how you felt made the recorded ride more demanding than the broad cue suggested.",
  };
  return {
    relation: "within" as const,
    value: `${rounded} W ${observed.label} · near the saved guide`,
    detail: "Recorded ride-level power sits within the broad range. This is descriptive evidence, not a compliance score.",
  };
}

function buildAdaptation(idea: SavedRideIdea, ride: ReflectionRide, minutes: number): CoachAdaptation {
  const strenuous = hardTypes.has(ride.trainingType) || (ride.intensityFactor >= 0.8 && ride.movingTimeSeconds >= 30 * 60) || ride.trainingLoad >= 60;
  const meaningful = ride.trainingLoad >= 30 || (minutes >= 30 && ride.intensityFactor >= 0.55);
  const reasons = [
    `${minutes} minutes and ${Math.round(ride.trainingLoad)} recorded training load are now included.`,
    ride.intensityFactor > 0 ? `The ride's stored intensity factor is ${ride.intensityFactor.toFixed(2)}.` : "Intensity factor was unavailable, so adaptation leans on duration and recorded load.",
    `The saved ${idea.intention.title.toLowerCase()} idea used a ${idea.thresholds.ftpWatts} W FTP snapshot.`,
  ];
  if (strenuous) return {
    version: COACH_ADAPTATION_VERSION,
    beforeMode: idea.intention.mode,
    nextMode: "recovery",
    summary: "The next ride idea makes room to absorb today's stronger work, with easy movement remaining optional.",
    reasons,
  };
  if (meaningful) return {
    version: COACH_ADAPTATION_VERSION,
    beforeMode: idea.intention.mode,
    nextMode: "recovery",
    summary: "The next day stays flexible after meaningful aerobic work: rest or a comfortable route are both useful choices.",
    reasons,
  };
  return {
    version: COACH_ADAPTATION_VERSION,
    beforeMode: idea.intention.mode,
    nextMode: "endurance",
    summary: "No extra recovery constraint was added; the next route can be chosen by freshness and enthusiasm.",
    reasons,
  };
}

export function buildCoachIntentionReflection(
  idea: SavedRideIdea,
  ride: ReflectionRide,
  matchConfidence: CoachConfidence,
  matchRationale: string,
  createdAt = new Date().toISOString(),
): CoachIntentionReflection {
  const minutes = Math.max(0, Math.round(ride.movingTimeSeconds / 60));
  const duration = durationObservation(idea, minutes);
  const effort = effortObservation(idea, ride);
  const evidenceConfidence = confidenceFor(matchConfidence, ride.dataQuality);
  const whatMatched = [
    `The ride occurred in the saved ${idea.setting} setting.`,
    ...(duration.relation === "within" ? ["Ride duration sat inside the broad time window."] : []),
    ...(effort.relation === "within" ? ["Ride-level power sat near the saved guide."] : []),
  ];
  const whatVaried = [
    ...(duration.relation === "shorter" ? ["You chose a shorter ride than the original time window."] : duration.relation === "longer" ? ["You extended the ride beyond the original time window."] : []),
    ...(effort.relation === "easier" ? ["Recorded ride-level power was gentler than the saved guide."] : effort.relation === "harder" ? ["Recorded ride-level power was stronger than the saved guide."] : []),
  ];
  if (!whatVaried.length) whatVaried.push("Nothing here needs grading; the available signals simply stayed near the broad idea.");
  const limitations = [
    ...(ride.dataQuality === "low" ? ["Ride evidence is limited, so the reflection avoids strong intensity conclusions."] : []),
    ...(effort.relation === "unknown" ? ["No usable ride-level power was available for the effort comparison."] : []),
    "Ride-level averages cannot show whether optional focus blocks happened exactly, and the app intentionally does not grade them.",
  ];
  const adaptation = buildAdaptation(idea, ride, minutes);
  return {
    version: COACH_REFLECTION_VERSION,
    rideIdeaId: idea.id,
    rideId: ride.id,
    dateIso: idea.dateIso,
    routeName: idea.route.name,
    rideName: ride.name,
    setting: idea.setting,
    intentionTitle: idea.intention.title,
    intentionMode: idea.intention.mode,
    matchConfidence,
    evidenceConfidence,
    matchRationale,
    headline: `Nice work—${minutes} minutes are now part of your riding story`,
    summary: `${ride.name} is reflected against the saved ${idea.intention.title.toLowerCase()} idea without turning the ride into a test.`,
    encouragement: strenuousMessage(ride, minutes),
    observations: [
      { label: "Time", value: duration.value, detail: duration.detail },
      { label: "Effort", value: effort.value, detail: effort.detail },
      {
        label: "Body signals",
        value: ride.averageHeartRateBpm && ride.averageHeartRateBpm > 0
          ? `${Math.round(ride.averageHeartRateBpm)} bpm average${ride.averageCadenceRpm && ride.averageCadenceRpm > 0 ? ` · ${Math.round(ride.averageCadenceRpm)} rpm` : ""}`
          : ride.averageCadenceRpm && ride.averageCadenceRpm > 0 ? `${Math.round(ride.averageCadenceRpm)} rpm average cadence` : "No HR or cadence summary",
        detail: "Heart rate and cadence add context. They are not treated as proof that a ride was right or wrong.",
      },
    ],
    whatMatched,
    whatVaried,
    limitations,
    adaptation,
    createdAt,
  };
}

function strenuousMessage(ride: ReflectionRide, minutes: number) {
  if (hardTypes.has(ride.trainingType) || ride.intensityFactor >= 0.8 || ride.trainingLoad >= 60) {
    return "That was meaningful work. You do not need to add more today for it to count.";
  }
  if (minutes >= 30 || ride.trainingLoad >= 30) return "You added useful aerobic time. Natural variation does not erase the benefit of showing up.";
  return "Short and gentle rides still build familiarity, consistency, and momentum.";
}
