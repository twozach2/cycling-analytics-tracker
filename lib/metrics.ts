import { round } from "./shared/math";

export type RideMetricInput = {
  movingTimeSeconds: number;
  averagePowerWatts: number | null;
  normalizedPowerWatts: number | null;
  averageHeartRateBpm: number | null;
  ftpWatts: number | null;
};

export type BodyCondition = "normal" | "mild_soreness" | "significant_soreness" | "pain_concern" | "illness";

export type PainLocation = "unspecified" | "knee" | "back" | "neck_shoulders" | "hands_wrists" | "hips" | "saddle_contact" | "other";

export type SubjectiveRecovery = {
  sleepQuality?: number;
  legFreshness?: "fresh" | "normal" | "heavy" | "dead";
  bodyCondition?: BodyCondition;
  painLocation?: PainLocation;
  painSeverity?: number;
  motivation?: number;
  illnessSeverity?: number;
  restingHeartRate?: number | null;
};

export type ReadinessComponent = {
  label: string;
  value: number;
  contribution: number;
  detail: string;
};

export type ReadinessResult = {
  score: number;
  label: "Ready for hard work" | "Good to train" | "Moderate fatigue" | "Easy ride preferred" | "Rest / recovery recommended";
  tone: "green" | "yellow" | "orange" | "red";
  confidence: "high" | "moderate" | "low";
  estimated: boolean;
  postRideAdjusted: boolean;
  adjustments: string[];
  assumptions: string[];
  components: ReadinessComponent[];
  restingHeartRateDelta: number | null;
};

export type RecoveryRecommendation = {
  minimumHours: number;
  maximumHours: number;
  status: "low fatigue" | "moderate fatigue" | "high fatigue" | "pain flag" | "illness flag";
  nextSession: string;
  reasons: string[];
};

export type DerivedRideMetrics = {
  powerHeartRateRatio: number | null;
  intensityFactor: number | null;
  intensityIsEstimated: boolean;
  trainingLoad: number | null;
  trainingLoadIsEstimated: boolean;
};

export type DecouplingEligibilityInput = {
  movingTimeSeconds: number;
  variabilityIndex: number | null;
  stoppedPercent: number | null;
  pairedSampleCount: number;
  pairedCoveragePercent: number;
  aerobicDecouplingPercent: number | null;
  isIntervalWorkout: boolean;
};

export type DecouplingConfidence = "none" | "low" | "moderate" | "high";

export type DecouplingEligibility = {
  eligible: boolean;
  confidence: DecouplingConfidence;
  reason: string;
};

export const DECOUPLING_PROTOCOL = {
  minimumDurationSeconds: 30 * 60,
  moderateDurationSeconds: 45 * 60,
  highDurationSeconds: 60 * 60,
  maximumVariabilityIndex: 1.08,
  maximumStoppedPercent: 5,
  minimumPairedSamples: 300,
  minimumPairedCoveragePercent: 60,
  minimumInterpretableDriftPercent: -5,
} as const;

export function decouplingDurationConfidence(movingTimeSeconds: number): DecouplingConfidence {
  if (movingTimeSeconds < DECOUPLING_PROTOCOL.minimumDurationSeconds) return "none";
  if (movingTimeSeconds < DECOUPLING_PROTOCOL.moderateDurationSeconds) return "low";
  if (movingTimeSeconds < DECOUPLING_PROTOCOL.highDurationSeconds) return "moderate";
  return "high";
}

const clamp = (value: number, minimum = 0, maximum = 100) => Math.min(maximum, Math.max(minimum, value));

export function calculateReadiness(input: {
  hoursSinceLastHardRide: number;
  acuteChronicRatio: number | null;
  subjective: SubjectiveRecovery;
  todayTrainingLoad?: number;
  todayIntensityFactor?: number;
  todayMovingTimeSeconds?: number;
  restingHeartRateBaseline?: number | null;
  checkInRecorded?: boolean;
}): ReadinessResult {
  const legScores = { fresh: 100, normal: 78, heavy: 45, dead: 10 } as const;
  const bodyScores = { normal: 100, mild_soreness: 75, significant_soreness: 35, pain_concern: 70, illness: 25 } as const;
  const hoursScore = clamp((input.hoursSinceLastHardRide / 48) * 100);
  const loadScore = input.acuteChronicRatio === null
    ? 75
    : input.acuteChronicRatio <= 1.2
      ? 100
      : clamp(100 - ((input.acuteChronicRatio - 1.2) * 90));
  const sleepScore = clamp((((input.subjective.sleepQuality ?? 3) - 1) / 4) * 100);
  const legScore = legScores[input.subjective.legFreshness ?? "normal"];
  const bodyCondition = input.subjective.bodyCondition ?? "normal";
  const bodyScore = bodyScores[bodyCondition];
  const painSeverity = bodyCondition === "pain_concern" ? clamp(input.subjective.painSeverity ?? 1, 1, 10) : 0;
  const illnessSeverity = bodyCondition === "illness" ? clamp(input.subjective.illnessSeverity ?? 1, 1, 10) : 0;
  const motivationScore = clamp((((input.subjective.motivation ?? 3) - 1) / 4) * 100);
  const todayTrainingLoad = Math.max(0, input.todayTrainingLoad ?? 0);
  const todayIntensityFactor = Math.max(0, input.todayIntensityFactor ?? 0);
  const todayMinutes = Math.max(0, (input.todayMovingTimeSeconds ?? 0) / 60);
  const adjustments: string[] = [];
  const assumptions: string[] = [];
  const components: ReadinessComponent[] = [
    { label: "Time since hard ride", value: Math.round(hoursScore), contribution: round(hoursScore * 0.25), detail: `${Math.round(input.hoursSinceLastHardRide)} hours available for recovery` },
    { label: "Training load balance", value: Math.round(loadScore), contribution: round(loadScore * 0.20), detail: input.acuteChronicRatio === null ? "No acute/chronic ratio; a neutral load value is used" : `Acute/chronic ratio ${input.acuteChronicRatio.toFixed(2)}` },
    { label: "Sleep", value: Math.round(sleepScore), contribution: round(sleepScore * 0.20), detail: `${input.subjective.sleepQuality ?? 3}/5 check-in` },
    { label: "Leg freshness", value: Math.round(legScore), contribution: round(legScore * 0.15), detail: input.subjective.legFreshness ?? "normal" },
    { label: "Body condition", value: Math.round(bodyScore), contribution: round(bodyScore * 0.15), detail: bodyCondition.replaceAll("_", " ") },
    { label: "Motivation", value: Math.round(motivationScore), contribution: round(motivationScore * 0.05), detail: `${input.subjective.motivation ?? 3}/5 check-in` },
  ];

  if (input.acuteChronicRatio === null) assumptions.push("Training-load balance is using a neutral value until enough ride history is available.");
  if (input.checkInRecorded === false) assumptions.push("Today's recovery check-in has not been saved; neutral questionnaire values are shown.");

  let score = Math.round(components.reduce((sum, component) => sum + component.contribution, 0));
  const currentRestingHeartRate = input.subjective.restingHeartRate;
  const baseline = input.restingHeartRateBaseline;
  const hasRestingHeartRateEvidence = Number.isFinite(currentRestingHeartRate) && Number.isFinite(baseline);
  const restingHeartRateDelta = hasRestingHeartRateEvidence ? Math.round(currentRestingHeartRate! - baseline!) : null;
  if (restingHeartRateDelta !== null) {
    const penalty = restingHeartRateDelta >= 10 ? 12 : restingHeartRateDelta >= 7 ? 8 : restingHeartRateDelta >= 4 ? 4 : 0;
    score -= penalty;
    components.push({
      label: "Resting heart rate",
      value: Math.max(0, 100 - (penalty * 5)),
      contribution: -penalty,
      detail: `${currentRestingHeartRate} bpm today; ${restingHeartRateDelta >= 0 ? "+" : ""}${restingHeartRateDelta} vs ${baseline} bpm baseline`,
    });
    if (penalty > 0) adjustments.push(`Resting heart rate is ${restingHeartRateDelta} bpm above baseline; readiness is adjusted conservatively.`);
  } else if (input.checkInRecorded) {
    assumptions.push("A resting-heart-rate trend needs today's reading and at least three prior readings.");
  }

  if (painSeverity >= 7) score = Math.min(score, 20);
  else if (painSeverity >= 5) score = Math.min(score, 39);
  else if (painSeverity >= 3) score = Math.min(score, 54);
  if (illnessSeverity >= 7) score = Math.min(score, 15);
  else if (illnessSeverity >= 4) score = Math.min(score, 30);
  else if (illnessSeverity > 0) score = Math.min(score, 45);

  if (todayTrainingLoad >= 60 || (todayIntensityFactor >= 0.8 && todayMinutes >= 30)) {
    score = Math.min(score, 54);
    adjustments.push(`Today's completed training was substantial: ${Math.round(todayTrainingLoad)} load, ${Math.round(todayMinutes)} minutes, max IF ${todayIntensityFactor.toFixed(2)}.`);
  } else if (todayTrainingLoad >= 30 || (todayIntensityFactor >= 0.7 && todayMinutes >= 30)) {
    score = Math.min(score, 69);
    adjustments.push(`Today's completed training added meaningful load: ${Math.round(todayTrainingLoad)} load across ${Math.round(todayMinutes)} minutes.`);
  } else if (todayTrainingLoad >= 15) {
    score = Math.min(score, 79);
    adjustments.push(`Today's completed easy training is included: ${Math.round(todayTrainingLoad)} load across ${Math.round(todayMinutes)} minutes.`);
  }

  score = Math.round(clamp(score));
  const result = score >= 85
    ? { label: "Ready for hard work" as const, tone: "green" as const }
    : score >= 70
      ? { label: "Good to train" as const, tone: "green" as const }
      : score >= 55
        ? { label: "Moderate fatigue" as const, tone: "yellow" as const }
        : score >= 40
          ? { label: "Easy ride preferred" as const, tone: "orange" as const }
          : { label: "Rest / recovery recommended" as const, tone: "red" as const };
  const confidence = input.checkInRecorded === true && input.acuteChronicRatio !== null && hasRestingHeartRateEvidence
    ? "high" as const
    : (input.checkInRecorded === true || input.acuteChronicRatio !== null)
      ? "moderate" as const
      : "low" as const;
  return {
    score,
    ...result,
    confidence,
    estimated: assumptions.length > 0 || confidence === "low",
    postRideAdjusted: todayTrainingLoad > 0 || todayMinutes > 0,
    adjustments,
    assumptions,
    components,
    restingHeartRateDelta,
  };
}
export function elapsedHoursSince(activityStartedAt: string | null, referenceTimeMs = Date.now(), fallbackHours = 72) {
  if (!activityStartedAt) return fallbackHours;
  const activityTimeMs = Date.parse(activityStartedAt);
  if (!Number.isFinite(activityTimeMs) || !Number.isFinite(referenceTimeMs)) return fallbackHours;
  return Math.max(0, (referenceTimeMs - activityTimeMs) / (60 * 60 * 1000));
}

export function deriveRideMetrics(input: RideMetricInput): DerivedRideMetrics {
  const powerHeartRateRatio =
    input.averagePowerWatts !== null &&
    input.averageHeartRateBpm !== null &&
    input.averageHeartRateBpm > 0
      ? round(input.averagePowerWatts / input.averageHeartRateBpm, 3)
      : null;

  const intensityPower =
    input.normalizedPowerWatts ?? input.averagePowerWatts;
  const intensityFactor =
    intensityPower !== null && input.ftpWatts !== null && input.ftpWatts > 0
      ? round(intensityPower / input.ftpWatts, 3)
      : null;
  const trainingLoad =
    intensityFactor !== null && input.movingTimeSeconds > 0
      ? round((input.movingTimeSeconds / 3600) * intensityFactor ** 2 * 100)
      : null;

  return {
    powerHeartRateRatio,
    intensityFactor,
    intensityIsEstimated: input.normalizedPowerWatts === null,
    trainingLoad,
    trainingLoadIsEstimated: input.normalizedPowerWatts === null,
  };
}

export function evaluateDecouplingEligibility(input: DecouplingEligibilityInput): DecouplingEligibility {
  const confidence = decouplingDurationConfidence(input.movingTimeSeconds);
  const ineligible = (reason: string): DecouplingEligibility => ({ eligible: false, confidence: "none", reason });
  if (confidence === "none") {
    return ineligible(`Ride is shorter than ${DECOUPLING_PROTOCOL.minimumDurationSeconds / 60} minutes.`);
  }
  if (input.isIntervalWorkout) {
    return ineligible("Trainer or interval workouts are excluded.");
  }
  if (input.variabilityIndex === null) {
    return ineligible("Variability index is unavailable.");
  }
  if (input.variabilityIndex > DECOUPLING_PROTOCOL.maximumVariabilityIndex) {
    return ineligible(`Power variability is above the ${DECOUPLING_PROTOCOL.maximumVariabilityIndex.toFixed(2)} VI limit (${input.variabilityIndex.toFixed(2)}).`);
  }
  if (input.stoppedPercent === null) {
    return ineligible("Stopped-time data is unavailable.");
  }
  if (input.stoppedPercent > DECOUPLING_PROTOCOL.maximumStoppedPercent) {
    return ineligible(`Stopped time exceeds ${DECOUPLING_PROTOCOL.maximumStoppedPercent}% (${input.stoppedPercent.toFixed(1)}%).`);
  }
  if (
    input.pairedSampleCount < DECOUPLING_PROTOCOL.minimumPairedSamples
    || input.pairedCoveragePercent < DECOUPLING_PROTOCOL.minimumPairedCoveragePercent
  ) {
    return ineligible("Insufficient paired power and heart-rate samples.");
  }
  if (input.aerobicDecouplingPercent === null) {
    return ineligible("Not enough complete intervals for analysis.");
  }
  if (input.aerobicDecouplingPercent < DECOUPLING_PROTOCOL.minimumInterpretableDriftPercent) {
    return ineligible(`Second-half efficiency improved by more than ${Math.abs(DECOUPLING_PROTOCOL.minimumInterpretableDriftPercent)}%; warm-up or pacing distribution is dominating the result.`);
  }
  const durationReason = confidence === "low"
    ? "Provisional estimate: 30-44 minutes provides limited duration evidence."
    : confidence === "moderate"
      ? "Moderate-confidence estimate: 45-59 minutes provides usable duration evidence."
      : "High-confidence estimate: at least 60 minutes provides the strongest duration evidence.";
  return { eligible: true, confidence, reason: `${durationReason} Power was stable, stopped time was minimal, and paired power/heart-rate data was sufficient.` };
}

function baseRecovery(load: number): [number, number] {
  if (load < 30) return [6, 12];
  if (load < 50) return [12, 18];
  if (load < 75) return [18, 24];
  if (load < 100) return [24, 36];
  if (load < 150) return [36, 48];
  if (load < 200) return [48, 72];
  return [72, 96];
}

export function recommendRecovery(
  metrics: DerivedRideMetrics,
  movingTimeSeconds: number,
  recent72HourLoad: number,
  subjective: SubjectiveRecovery = {},
): RecoveryRecommendation {
  const illnessSeverity = subjective.bodyCondition === "illness" ? subjective.illnessSeverity ?? 1 : 0;
  if (illnessSeverity > 0) {
    return {
      minimumHours: illnessSeverity >= 4 ? 24 : 12,
      maximumHours: illnessSeverity >= 4 ? 72 : 36,
      status: "illness flag",
      nextSession: illnessSeverity >= 4
        ? "Training guidance is withheld. Rest and follow appropriate medical guidance for concerning symptoms."
        : "Skip intensity. Reassess symptoms before choosing any easy movement.",
      reasons: [
        `Illness symptoms reported at ${illnessSeverity}/10`,
        "Illness is a safety guardrail rather than a training-load adjustment",
      ],
    };
  }
  const painSeverity = subjective.bodyCondition === "pain_concern" ? subjective.painSeverity ?? 1 : 0;
  if (painSeverity >= 3) {
    const location = formatPainLocation(subjective.painLocation);
    return {
      minimumHours: 24,
      maximumHours: 48,
      status: "pain flag",
      nextSession: painSeverity >= 7
        ? "Do not train through severe pain. Stop and seek appropriate medical guidance."
        : "No hard riding. Rest or use pain-free movement only; reassess symptoms.",
      reasons: [
        `${location} pain or injury concern is ${painSeverity}/10`,
        "A pain concern acts as a safety guardrail rather than a fatigue score",
      ],
    };
  }

  const load = metrics.trainingLoad ?? 0;
  let [minimumHours, maximumHours] = baseRecovery(load);
  const reasons = [
    `${metrics.trainingLoadIsEstimated ? "Estimated load" : "Training load"}: ${Math.round(load)}`,
  ];

  const intensity = metrics.intensityFactor ?? 0;
  let intensityAdjustment = 0;
  if (intensity >= 1.05) intensityAdjustment = 18;
  else if (intensity >= 0.95) intensityAdjustment = 12;
  else if (intensity >= 0.85) intensityAdjustment = 8;
  else if (intensity >= 0.75) intensityAdjustment = 4;

  // Very short maximal work should not produce an implausibly large estimate.
  if (movingTimeSeconds < 30 * 60) intensityAdjustment = Math.min(8, intensityAdjustment);
  minimumHours += intensityAdjustment;
  maximumHours += intensityAdjustment;
  if (intensityAdjustment) reasons.push(`Intensity factor: ${intensity.toFixed(2)}`);

  let durationAdjustment = 0;
  if (movingTimeSeconds > 3 * 3600) durationAdjustment = 12;
  else if (movingTimeSeconds >= 2 * 3600) durationAdjustment = 8;
  else if (movingTimeSeconds >= 75 * 60) durationAdjustment = 4;
  else if (movingTimeSeconds >= 45 * 60) durationAdjustment = 2;
  minimumHours += durationAdjustment;
  maximumHours += durationAdjustment;
  if (durationAdjustment) {
    reasons.push(`Ride duration: ${formatDuration(movingTimeSeconds)}`);
  }

  let recentLoadAdjustment = 0;
  if (recent72HourLoad > 300) recentLoadAdjustment = 18;
  else if (recent72HourLoad >= 225) recentLoadAdjustment = 12;
  else if (recent72HourLoad >= 150) recentLoadAdjustment = 8;
  else if (recent72HourLoad >= 75) recentLoadAdjustment = 4;
  minimumHours += recentLoadAdjustment;
  maximumHours += recentLoadAdjustment;
  if (recentLoadAdjustment) reasons.push(`72-hour load: ${Math.round(recent72HourLoad)}`);

  if ((subjective.sleepQuality ?? 5) <= 2) {
    minimumHours += 8;
    maximumHours += 12;
    reasons.push("Sleep quality was low");
  }
  if (subjective.legFreshness === "heavy") {
    minimumHours += 6;
    maximumHours += 8;
    reasons.push("Legs reported as heavy");
  }
  if (subjective.legFreshness === "dead") {
    minimumHours += 18;
    maximumHours += 24;
    reasons.push("Legs reported as dead");
  }
  if (subjective.bodyCondition === "significant_soreness") {
    minimumHours += 8;
    maximumHours += 12;
    reasons.push("Significant soreness or stiffness reported");
  } else if (subjective.bodyCondition === "mild_soreness") {
    reasons.push("Mild soreness or stiffness reported");
  }

  const status =
    minimumHours >= 48
      ? "high fatigue"
      : minimumHours >= 24
        ? "moderate fatigue"
        : "low fatigue";
  const nextSession =
    status === "high fatigue"
      ? "Rest or an easy Zone 1 spin; reassess before intensity."
      : status === "moderate fatigue"
        ? "Easy Zone 1–2 or complete rest."
        : "Easy endurance is reasonable if normal readiness cues agree.";

  return {
    minimumHours,
    maximumHours,
    status,
    nextSession,
    reasons,
  };
}

function formatPainLocation(location: PainLocation | undefined) {
  const labels: Record<PainLocation, string> = {
    unspecified: "Unspecified",
    knee: "Knee",
    back: "Back",
    neck_shoulders: "Neck or shoulder",
    hands_wrists: "Hand or wrist",
    hips: "Hip",
    saddle_contact: "Saddle or contact-point",
    other: "Other",
  };
  return labels[location ?? "unspecified"];
}

export function formatDuration(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  if (hours > 0) return `${hours}h ${minutes.toString().padStart(2, "0")}m`;
  return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
}
