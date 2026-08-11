import { dataQualityRank, type EvidenceLevel } from "./data-quality";
import type { SubjectiveRecovery } from "./metrics";

export const COACH_ALGORITHM_VERSION = "coach-v2";
export const TREND_ALGORITHM_VERSION = "trend-v1";

export type CoachRide = {
  id: string;
  name: string;
  date: string;
  trainingType: string;
  context: string;
  environment: "virtual" | "indoor" | "outdoor";
  movingTimeSeconds: number;
  trainingLoad: number;
  intensityFactor: number;
  averagePower: number;
  averageHeartRate: number;
  powerHeartRateRatio: number;
  classificationConfidence: "low" | "moderate" | "high";
  dataQualityLevel: EvidenceLevel;
};

export type TrendStatus = "insufficient" | "possible" | "likely" | "established";
export type TrendDirection = "improving" | "stable" | "declining" | "unknown";

export type CoachTrend = {
  id: "endurance_efficiency";
  title: string;
  status: TrendStatus;
  direction: TrendDirection;
  confidence: "low" | "moderate" | "high";
  supportingRides: number;
  changePercent: number | null;
  environment: CoachRide["environment"] | null;
  summary: string;
  evidence: string[];
  limitations: string[];
};

export type PersonalBaseline = {
  trainingType: string;
  rideCount: number;
  recentRideCount: number;
  medianDurationMinutes: number;
  medianTrainingLoad: number;
  medianPowerWatts: number | null;
  medianHeartRateBpm: number | null;
  medianEfficiency: number | null;
};

export type CoachMode = "rest" | "recovery" | "endurance" | "tempo";
export type CoachConfidence = "low" | "moderate" | "high";
export type CoachCompletionStatus = "not_started" | "matched" | "lighter" | "harder";

export type CoachCompletionAssessment = {
  status: CoachCompletionStatus;
  plannedMode: CoachMode;
  actualMode: Exclude<CoachMode, "rest"> | null;
  completedRideCount: number;
  completedMinutes: number;
  completedLoad: number;
  headline: string;
  detail: string;
  inferredPlan: boolean;
};


export type CoachDay = {
  dateIso: string;
  day: string;
  dateLabel: string;
  session: string;
  purpose: string;
  confidence: CoachConfidence;
  adaptive: boolean;
};

export type CoachReport = {
  algorithmVersion: typeof COACH_ALGORITHM_VERSION;
  generatedAt: string;
  state: "ready" | "caution" | "withheld";
  mode: CoachMode;
  confidence: CoachConfidence;
  primary: string;
  detail: string;
  avoid: string;
  nextQualitySession: string;
  recommendationWithheld: boolean;
  completion: CoachCompletionAssessment;
  positives: string[];
  cautions: string[];
  guardrails: string[];
  evidenceSummary: {
    recentRides: number;
    highQualityRides: number;
    moderateQualityRides: number;
    lowQualityRides: number;
    checkInRecorded: boolean;
    acuteLoad: number;
    chronicWeeklyLoad: number;
    acuteChronicRatio: number | null;
    hoursSinceLastHardRide: number;
    recentHardSessions: number;
    todayRides: number;
    todayMinutes: number;
    todayTrainingLoad: number;
    todayMaxIntensityFactor: number;
  };
  trend: CoachTrend;
  baselines: PersonalBaseline[];
  weeklyPlan: CoachDay[];
};

export type BuildCoachReportInput = {
  rides: readonly CoachRide[];
  readinessScore: number;
  preRideReadinessScore?: number;
  subjective: SubjectiveRecovery;
  checkInRecorded: boolean;
  referenceDate?: string | Date;
};

const dayMs = 24 * 60 * 60 * 1000;
const hardTypes = new Set(["Tempo", "Sweet Spot", "Threshold", "VO2", "Sprint", "FTP Test"]);
const isObjectivelyHard = (ride: CoachRide) => hardTypes.has(ride.trainingType) || (ride.intensityFactor >= 0.8 && ride.movingTimeSeconds >= 30 * 60);
const localDayKey = (value: string | Date) => {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

const median = (values: readonly number[]) => {
  const valid = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!valid.length) return null;
  const middle = Math.floor(valid.length / 2);
  return valid.length % 2 ? valid[middle] : (valid[middle - 1] + valid[middle]) / 2;
};

const boundedDate = (value: string | Date | undefined) => {
  const parsed = value instanceof Date ? value : value ? new Date(value) : new Date();
  return Number.isFinite(parsed.getTime()) ? parsed : new Date();
};

const timestamp = (ride: CoachRide) => Date.parse(ride.date);
const inWindow = (ride: CoachRide, now: number, days: number) => {
  const value = timestamp(ride);
  return Number.isFinite(value) && value <= now && value >= now - (days * dayMs);
};

function hoursSince(date: string | undefined, now: number, fallback = 168) {
  if (!date) return fallback;
  const value = Date.parse(date);
  return Number.isFinite(value) ? Math.max(0, (now - value) / 3_600_000) : fallback;
}

export function buildPersonalBaselines(rides: readonly CoachRide[], referenceDate?: string | Date): PersonalBaseline[] {
  const now = boundedDate(referenceDate).getTime();
  const groups = new Map<string, CoachRide[]>();
  for (const ride of rides) {
    if (!Number.isFinite(timestamp(ride)) || ride.movingTimeSeconds <= 0) continue;
    const current = groups.get(ride.trainingType) ?? [];
    current.push(ride);
    groups.set(ride.trainingType, current);
  }
  return [...groups.entries()].map(([trainingType, group]) => ({
    trainingType,
    rideCount: group.length,
    recentRideCount: group.filter((ride) => inWindow(ride, now, 30)).length,
    medianDurationMinutes: Math.round(median(group.map((ride) => ride.movingTimeSeconds / 60)) ?? 0),
    medianTrainingLoad: Math.round(median(group.map((ride) => ride.trainingLoad).filter((value) => value > 0)) ?? 0),
    medianPowerWatts: median(group.map((ride) => ride.averagePower).filter((value) => value > 0)),
    medianHeartRateBpm: median(group.map((ride) => ride.averageHeartRate).filter((value) => value > 0)),
    medianEfficiency: median(group.map((ride) => ride.powerHeartRateRatio).filter((value) => value > 0)),
  })).sort((a, b) => b.rideCount - a.rideCount || a.trainingType.localeCompare(b.trainingType));
}

export function detectEnduranceTrend(rides: readonly CoachRide[]): CoachTrend {
  const candidates = rides.filter((ride) => (
    ride.trainingType === "Zone 2"
    && (ride.context === "ordinary" || ride.context === "benchmark")
    && ride.powerHeartRateRatio > 0
    && ride.intensityFactor >= 0.55
    && ride.intensityFactor <= 0.8
    && ride.classificationConfidence !== "low"
    && ride.dataQualityLevel !== "low"
  ));
  const byEnvironment = new Map<CoachRide["environment"], CoachRide[]>();
  candidates.forEach((ride) => byEnvironment.set(ride.environment, [...(byEnvironment.get(ride.environment) ?? []), ride]));
  const cohort = [...byEnvironment.entries()]
    .map(([environment, cohortRides]) => ({ environment, rides: cohortRides.sort((a, b) => timestamp(a) - timestamp(b)) }))
    .sort((a, b) => b.rides.length - a.rides.length || (timestamp(b.rides.at(-1)!) - timestamp(a.rides.at(-1)!)))[0];

  if (!cohort || cohort.rides.length < 2) {
    return {
      id: "endurance_efficiency",
      title: "Endurance efficiency",
      status: "insufficient",
      direction: "unknown",
      confidence: "low",
      supportingRides: cohort?.rides.length ?? 0,
      changePercent: null,
      environment: cohort?.environment ?? null,
      summary: "Trend withheld until at least two comparable Zone 2 rides exist.",
      evidence: [],
      limitations: ["Requires matching environment, usable power and heart rate, and non-low classification and data quality."],
    };
  }

  const cohortIntensity = median(cohort.rides.map((ride) => ride.intensityFactor))!;
  const ordered = cohort.rides.filter((ride) => Math.abs(ride.intensityFactor - cohortIntensity) <= 0.05);
  if (ordered.length < 2) {
    return {
      id: "endurance_efficiency",
      title: "Endurance efficiency",
      status: "insufficient",
      direction: "unknown",
      confidence: "low",
      supportingRides: ordered.length,
      changePercent: null,
      environment: cohort.environment,
      summary: "Trend withheld until at least two Zone 2 rides have comparable intensity.",
      evidence: [`${cohort.rides.length} rides matched the ${cohort.environment} environment`],
      limitations: ["Supporting rides must be within 0.05 IF of the cohort median and between 0.55 and 0.80 IF."],
    };
  }
  const supportingRides = ordered.length;
  const sampleSize = Math.min(2, Math.floor(supportingRides / 2));
  const first = median(ordered.slice(0, sampleSize).map((ride) => ride.powerHeartRateRatio))!;
  const latest = median(ordered.slice(-sampleSize).map((ride) => ride.powerHeartRateRatio))!;
  const changePercent = Math.round((((latest - first) / first) * 100) * 10) / 10;
  const direction: TrendDirection = changePercent > 2 ? "improving" : changePercent < -2 ? "declining" : "stable";
  const spanDays = Math.max(0, (timestamp(ordered.at(-1)!) - timestamp(ordered[0])) / dayMs);
  const status: TrendStatus = supportingRides >= 5 && spanDays >= 21 ? "established" : supportingRides >= 3 ? "likely" : "possible";
  const qualityFloor = Math.min(...ordered.map((ride) => dataQualityRank(ride.dataQualityLevel)));
  const confidence: CoachTrend["confidence"] = status === "established" && qualityFloor >= 3 && cohort.environment !== "outdoor"
    ? "high"
    : status === "likely" || status === "established"
      ? "moderate"
      : "low";
  const limitations = [] as string[];
  if (cohort.environment === "outdoor") limitations.push("Outdoor wind, traffic, surface, and drafting are not observed, so confidence is capped.");
  if (status !== "established") limitations.push("An established trend requires at least five supporting rides spanning three weeks.");
  if (qualityFloor < 3) limitations.push("At least one supporting ride has partial rather than detailed evidence.");

  return {
    id: "endurance_efficiency",
    title: "Endurance efficiency",
    status,
    direction,
    confidence,
    supportingRides,
    changePercent,
    environment: cohort.environment,
    summary: `${status[0].toUpperCase()}${status.slice(1)} ${direction} signal: ${Math.abs(changePercent).toFixed(1)}% ${direction === "improving" ? "higher" : direction === "declining" ? "lower" : "change"} in median watts per heartbeat.`,
    evidence: [
      `${supportingRides} comparable ${cohort.environment} Zone 2 rides`,
      `Intensity matched within 0.05 IF of the ${cohortIntensity.toFixed(2)} cohort median`,
      `Earlier median ${first.toFixed(3)} W/bpm; recent median ${latest.toFixed(3)} W/bpm`,
      `${Math.round(spanDays)} days between first and latest supporting rides`,
    ],
    limitations,
  };
}

function formatSession(mode: CoachMode, duration: number) {
  if (mode === "rest") return "Rest and reassess";
  if (mode === "recovery") return `Recovery spin · ${Math.max(20, Math.min(40, duration))} min`;
  if (mode === "endurance") return `Easy Zone 2 · ${Math.max(35, Math.min(90, duration))} min`;
  return `Tempo development · ${Math.max(40, Math.min(75, duration))} min`;
}

function calendarDay(date: Date) {
  return {
    dateIso: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`,
    day: date.toLocaleDateString("en-US", { weekday: "short" }),
    dateLabel: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
  };
}

type CoachDecision = {
  mode: CoachMode;
  state: CoachReport["state"];
  recommendationWithheld: boolean;
  primary: string;
  detail: string;
  avoid: string;
};

type CoachDecisionInput = {
  painSeverity: number;
  illnessSeverity: number;
  legFreshness: SubjectiveRecovery["legFreshness"];
  todayTrainingLoad: number;
  todayStrenuous: boolean;
  todayMinutes: number;
  todayMaxIntensityFactor: number;
  readinessScore: number;
  loadRatio: number | null;
  recentHardSessions: number;
  hoursSinceLastHardRide: number;
  checkInRecorded: boolean;
  recentEvidence: EvidenceLevel;
  typicalEnduranceMinutes: number;
};

function decideCoachSession(input: CoachDecisionInput): CoachDecision {
  let mode: CoachMode = "endurance";
  let state: CoachReport["state"] = "caution";
  let recommendationWithheld = false;
  let primary = formatSession("endurance", input.typicalEnduranceMinutes);
  let detail = "Keep the effort conversational and finish with energy in reserve.";
  let avoid = "Adding intensity because the first minutes feel easy";

  if (input.painSeverity >= 5 || input.illnessSeverity >= 4) {
    mode = "rest";
    state = "withheld";
    recommendationWithheld = true;
    primary = "Training recommendation withheld";
    detail = input.painSeverity >= 5 ? "A substantial pain concern needs reassessment before cycling load." : "Illness symptoms make training guidance inappropriate today.";
    avoid = "Training through pain, fever, chest symptoms, or worsening illness";
  } else if (input.painSeverity >= 3 || input.illnessSeverity > 0 || input.legFreshness === "dead") {
    mode = "recovery";
    primary = formatSession("recovery", input.typicalEnduranceMinutes);
    detail = "Use pain-free, very light movement only and stop if symptoms increase.";
    avoid = "Intervals, forceful low-cadence work, and riding through symptoms";
  } else if (input.todayTrainingLoad >= 60 || input.todayStrenuous) {
    mode = "rest";
    primary = "Training complete for today";
    detail = `Today's ${input.todayMinutes}-minute ride supplied ${input.todayTrainingLoad} load at up to IF ${input.todayMaxIntensityFactor.toFixed(2)}. Recovery is the remaining assignment.`;
    avoid = "Adding a second training session after today's completed load";
  } else if (input.todayTrainingLoad >= 30) {
    mode = "recovery";
    primary = "Meaningful training already completed";
    detail = `Today's riding supplied ${input.todayTrainingLoad} load. Only optional, very light movement remains appropriate.`;
    avoid = "Turning optional recovery movement into another workout";
  } else if (input.readinessScore < 40 || (input.loadRatio ?? 0) > 1.5) {
    mode = "rest";
    primary = "Complete rest or gentle movement";
    detail = "Let fatigue and recent load settle, then repeat the recovery check-in.";
    avoid = "Adding load to rescue the week";
  } else if (input.readinessScore < 55) {
    mode = "recovery";
    primary = formatSession("recovery", input.typicalEnduranceMinutes);
    detail = "Keep this genuinely easy; the purpose is circulation, not fitness stress.";
    avoid = "Threshold or VO2 work";
  } else if (input.readinessScore < 70 || input.recentHardSessions >= 2 || input.hoursSinceLastHardRide < 36 || !input.checkInRecorded || input.recentEvidence === "low") {
    mode = "endurance";
    primary = formatSession("endurance", input.typicalEnduranceMinutes);
    detail = "Build low-cost aerobic volume while preserving the option for a later quality session.";
    avoid = "Unplanned surges and threshold work";
  } else {
    mode = "tempo";
    state = "ready";
    primary = formatSession("tempo", Math.max(45, Math.round(input.typicalEnduranceMinutes * 0.9)));
    detail = "Complete three controlled 8-10 minute tempo efforts with five easy minutes between them.";
    avoid = "Turning the final effort into a maximal test";
  }

  return { mode, state, recommendationWithheld, primary, detail, avoid };
}

function completedRideMode(rides: readonly CoachRide[], trainingLoad: number, minutes: number): Exclude<CoachMode, "rest"> | null {
  if (!rides.length) return null;
  if (rides.some(isObjectivelyHard)) return "tempo";
  if (rides.some((ride) => ride.trainingType === "Zone 2") || trainingLoad >= 30 || (minutes >= 30 && Math.max(...rides.map((ride) => ride.intensityFactor)) >= 0.55)) return "endurance";
  return "recovery";
}

const modeLabel = (mode: CoachMode) => mode === "tempo" ? "quality / tempo" : mode === "endurance" ? "Zone 2 / endurance" : mode;

function assessCompletion(plannedMode: CoachMode, rides: readonly CoachRide[], trainingLoad: number, minutes: number): CoachCompletionAssessment {
  const actualMode = completedRideMode(rides, trainingLoad, minutes);
  if (actualMode === null) return { status: "not_started", plannedMode, actualMode, completedRideCount: 0, completedMinutes: 0, completedLoad: 0, headline: "No completed ride detected yet", detail: `Today's inferred plan is ${modeLabel(plannedMode)}.`, inferredPlan: true };
  const rank: Record<CoachMode, number> = { rest: 0, recovery: 1, endurance: 2, tempo: 3 };
  const status: CoachCompletionStatus = actualMode === plannedMode ? "matched" : rank[actualMode] < rank[plannedMode] ? "lighter" : "harder";
  const headline = status === "matched" ? "Today's ride matched the planned stress" : status === "lighter" ? "Today's ride was lighter than planned" : plannedMode === "rest" ? "Training was completed on a planned rest day" : "Today's ride exceeded the planned stress";
  const detail = `Inferred plan: ${modeLabel(plannedMode)}. Completed: ${modeLabel(actualMode)}, ${minutes} minutes and ${trainingLoad} load across ${rides.length} ${rides.length === 1 ? "ride" : "rides"}.`;
  return { status, plannedMode, actualMode, completedRideCount: rides.length, completedMinutes: minutes, completedLoad: trainingLoad, headline, detail, inferredPlan: true };
}

export function buildCoachReport(input: BuildCoachReportInput): CoachReport {
  const reference = boundedDate(input.referenceDate);
  const now = reference.getTime();
  const rides = [...input.rides].filter((ride) => Number.isFinite(timestamp(ride)) && timestamp(ride) <= now).sort((a, b) => timestamp(b) - timestamp(a));
  const recent = rides.filter((ride) => inWindow(ride, now, 28));
  const acute = rides.filter((ride) => inWindow(ride, now, 7));
  const hard = rides.filter(isObjectivelyHard);
  const recentHard = hard.filter((ride) => inWindow(ride, now, 7));
  const todayRides = rides.filter((ride) => localDayKey(ride.date) === localDayKey(reference));
  const todayTrainingLoad = Math.round(todayRides.reduce((sum, ride) => sum + Math.max(0, ride.trainingLoad), 0));
  const todayMinutes = Math.round(todayRides.reduce((sum, ride) => sum + Math.max(0, ride.movingTimeSeconds), 0) / 60);
  const todayMaxIntensityFactor = Math.max(0, ...todayRides.map((ride) => ride.intensityFactor));
  const todayStrenuous = todayRides.some(isObjectivelyHard);
  const acuteLoad = Math.round(acute.reduce((sum, ride) => sum + Math.max(0, ride.trainingLoad), 0));
  const chronicWeeklyLoad = Math.round(recent.reduce((sum, ride) => sum + Math.max(0, ride.trainingLoad), 0) / 4);
  const recentSpanDays = recent.length > 1 ? (timestamp(recent[0]) - timestamp(recent.at(-1)!)) / dayMs : 0;
  const chronicBaselineReady = recent.length >= 4 && recentSpanDays >= 14;
  const acuteChronicRatio = chronicBaselineReady && chronicWeeklyLoad > 0 ? Math.round((acuteLoad / chronicWeeklyLoad) * 100) / 100 : null;
  const hoursSinceLastHardRide = Math.round(hoursSince(hard[0]?.date, now));
  const highQualityRides = recent.filter((ride) => ride.dataQualityLevel === "high").length;
  const moderateQualityRides = recent.filter((ride) => ride.dataQualityLevel === "moderate").length;
  const lowQualityRides = recent.filter((ride) => ride.dataQualityLevel === "low").length;
  const recentEvidence: EvidenceLevel = highQualityRides >= 2 ? "high" : highQualityRides + moderateQualityRides >= 2 ? "moderate" : "low";
  const painSeverity = input.subjective.bodyCondition === "pain_concern" ? input.subjective.painSeverity ?? 1 : 0;
  const illnessSeverity = input.subjective.bodyCondition === "illness" ? input.subjective.illnessSeverity ?? 1 : 0;
  const baselines = buildPersonalBaselines(rides, reference);
  const enduranceBaseline = baselines.find((baseline) => baseline.trainingType === "Zone 2");
  const typicalEnduranceMinutes = enduranceBaseline?.medianDurationMinutes || 50;
  const trend = detectEnduranceTrend(rides);
  const beforeToday = rides.filter((ride) => localDayKey(ride.date) !== localDayKey(reference));
  const preRecent = beforeToday.filter((ride) => inWindow(ride, now, 28));
  const preAcute = beforeToday.filter((ride) => inWindow(ride, now, 7));
  const preHard = beforeToday.filter(isObjectivelyHard);
  const preRecentHard = preHard.filter((ride) => inWindow(ride, now, 7));
  const preChronicWeeklyLoad = Math.round(preRecent.reduce((sum, ride) => sum + Math.max(0, ride.trainingLoad), 0) / 4);
  const preRecentSpanDays = preRecent.length > 1 ? (timestamp(preRecent[0]) - timestamp(preRecent.at(-1)!)) / dayMs : 0;
  const preLoadRatio = preRecent.length >= 4 && preRecentSpanDays >= 14 && preChronicWeeklyLoad > 0
    ? Math.round((preAcute.reduce((sum, ride) => sum + Math.max(0, ride.trainingLoad), 0) / preChronicWeeklyLoad) * 100) / 100
    : null;
  const preHighQualityRides = preRecent.filter((ride) => ride.dataQualityLevel === "high").length;
  const preModerateQualityRides = preRecent.filter((ride) => ride.dataQualityLevel === "moderate").length;
  const preRecentEvidence: EvidenceLevel = preHighQualityRides >= 2 ? "high" : preHighQualityRides + preModerateQualityRides >= 2 ? "moderate" : "low";
  const plannedDecision = decideCoachSession({
    painSeverity,
    illnessSeverity,
    legFreshness: input.subjective.legFreshness,
    todayTrainingLoad: 0,
    todayStrenuous: false,
    todayMinutes: 0,
    todayMaxIntensityFactor: 0,
    readinessScore: input.preRideReadinessScore ?? input.readinessScore,
    loadRatio: preLoadRatio,
    recentHardSessions: preRecentHard.length,
    hoursSinceLastHardRide: Math.round(hoursSince(preHard[0]?.date, now)),
    checkInRecorded: input.checkInRecorded,
    recentEvidence: preRecentEvidence,
    typicalEnduranceMinutes,
  });
  const completion = assessCompletion(plannedDecision.mode, todayRides, todayTrainingLoad, todayMinutes);
  const positives: string[] = [];
  const cautions: string[] = [];
  const guardrails: string[] = [];

  if (input.readinessScore >= 70) positives.push(`Readiness is ${input.readinessScore}/100.`);
  else cautions.push(`Readiness is ${input.readinessScore}/100.`);
  if (todayRides.length) positives.push(`${todayRides.length} completed ${todayRides.length === 1 ? "ride is" : "rides are"} included today: ${todayMinutes} minutes and ${todayTrainingLoad} load.`);
  if (todayStrenuous || todayTrainingLoad >= 30) cautions.push(`Today's completed work reached IF ${todayMaxIntensityFactor.toFixed(2)} and closes the intensity window for this plan.`);
  if (hoursSinceLastHardRide >= 36) positives.push(`${hoursSinceLastHardRide} hours since the last hard session.`);
  else cautions.push(`Only ${hoursSinceLastHardRide} hours since the last hard session.`);
  if (acuteChronicRatio === null) cautions.push("The 28-day weekly load baseline is not stable yet.");
  else if (acuteChronicRatio <= 1.3) positives.push(`Seven-day load is ${acuteChronicRatio.toFixed(2)}? the 28-day weekly baseline.`);
  else cautions.push(`Seven-day load is elevated at ${acuteChronicRatio.toFixed(2)}? the 28-day weekly baseline.`);
  if (recentHard.length >= 2) cautions.push(`${recentHard.length} hard sessions already occurred in the last seven days.`);
  else positives.push(`${recentHard.length} hard ${recentHard.length === 1 ? "session" : "sessions"} in the last seven days.`);
  if (!input.checkInRecorded) cautions.push("Today's recovery check-in has not been saved.");
  if (recentEvidence === "high") positives.push(`${highQualityRides} recent rides contain detailed power and heart-rate evidence.`);
  else cautions.push("Recent training evidence is partial; hard-session advice is capped.");
  if (painSeverity > 0) guardrails.push(`Pain or injury concern reported at ${painSeverity}/10.`);
  if (illnessSeverity > 0) guardrails.push(`Illness symptoms reported at ${illnessSeverity}/10.`);
  if (input.subjective.legFreshness === "dead") guardrails.push("Legs were reported as dead.");

  const { mode, state, recommendationWithheld, primary, detail, avoid } = decideCoachSession({
    painSeverity,
    illnessSeverity,
    legFreshness: input.subjective.legFreshness,
    todayTrainingLoad,
    todayStrenuous,
    todayMinutes,
    todayMaxIntensityFactor,
    readinessScore: input.readinessScore,
    loadRatio: acuteChronicRatio,
    recentHardSessions: recentHard.length,
    hoursSinceLastHardRide,
    checkInRecorded: input.checkInRecorded,
    recentEvidence,
    typicalEnduranceMinutes,
  });

  let confidence: CoachConfidence = recentEvidence === "high" && input.checkInRecorded && recent.length >= 5 ? "high" : recentEvidence !== "low" && input.checkInRecorded ? "moderate" : "low";
  if (recommendationWithheld) confidence = "high";
  if (mode === "tempo" && trend.confidence === "low") confidence = confidence === "high" ? "moderate" : confidence;
  const nextQualitySession = recommendationWithheld
    ? "Reassess after symptoms improve and a new check-in is saved."
    : todayTrainingLoad >= 60 || todayStrenuous
      ? "After at least 36 hours from today's ride, if a fresh check-in and current load both support intensity."
      : mode === "tempo"
        ? "After at least one easy or rest day, if readiness remains at least 70."
        : "Reassess tomorrow; require readiness at least 70, 36 hours since hard work, and no safety flag.";

  const weekModes: CoachMode[] = mode === "tempo"
    ? [mode, "recovery", "endurance", "rest", "tempo", "endurance", "rest"]
    : mode === "rest"
      ? [mode, "recovery", "endurance", "rest", "endurance", "endurance", "rest"]
      : mode === "recovery"
        ? [mode, "endurance", "rest", "endurance", "tempo", "endurance", "rest"]
        : [mode, "rest", "tempo", "recovery", "endurance", "endurance", "rest"];
  if (recommendationWithheld || illnessSeverity > 0 || painSeverity >= 3) weekModes.fill("rest", 1);
  else if (recentHard.length >= 2 || !input.checkInRecorded || recentEvidence === "low") {
    for (let index = 1; index < weekModes.length; index += 1) {
      if (weekModes[index] === "tempo") weekModes[index] = "endurance";
    }
  }
  if (!recommendationWithheld && painSeverity < 3 && illnessSeverity === 0 && todayRides.length && (completion.actualMode === "tempo" || todayTrainingLoad >= 30)) {
    weekModes[1] = "recovery";
  }

  const weeklyPlan = weekModes.map((dayMode, index): CoachDay => {
    const date = new Date(reference);
    date.setDate(reference.getDate() + index);
    const duration = dayMode === "endurance" ? typicalEnduranceMinutes : dayMode === "tempo" ? Math.max(45, Math.round(typicalEnduranceMinutes * 0.9)) : typicalEnduranceMinutes;
    const postRidePurpose = index === 1 && todayRides.length
      ? completion.status === "harder" ? "Protect recovery after today exceeded the inferred plan."
        : completion.status === "matched" ? "Absorb today's matched session before adding more stress."
          : "Reassess after today's lighter-than-planned session; do not automatically make up the difference."
      : null;
    return {
      ...calendarDay(date),
      session: index === 0 ? primary : formatSession(dayMode, duration),
      purpose: index === 0
        ? detail
        : postRidePurpose ?? (recommendationWithheld
          ? "Placeholder only; reassess symptoms before training."
          : dayMode === "rest"
            ? "Absorb recent training and update the check-in."
            : dayMode === "recovery"
              ? "Low-cost movement between training days."
              : dayMode === "tempo"
                ? "Quality work only if that morning's guardrails still pass."
                : "Build aerobic volume near your personal duration baseline."),
      confidence: index === 0 ? confidence : "low",
      adaptive: index > 0,
    };
  });

  return {
    algorithmVersion: COACH_ALGORITHM_VERSION,
    generatedAt: reference.toISOString(),
    state,
    mode,
    confidence,
    primary,
    detail,
    avoid,
    nextQualitySession,
    recommendationWithheld,
    positives,
    completion,
    cautions,
    guardrails,
    evidenceSummary: {
      recentRides: recent.length,
      highQualityRides,
      moderateQualityRides,
      lowQualityRides,
      checkInRecorded: input.checkInRecorded,
      acuteLoad,
      chronicWeeklyLoad,
      acuteChronicRatio,
      hoursSinceLastHardRide,
      recentHardSessions: recentHard.length,
      todayRides: todayRides.length,
      todayMinutes,
      todayTrainingLoad,
      todayMaxIntensityFactor,
    },
    trend,
    baselines,
    weeklyPlan,
  };
}
