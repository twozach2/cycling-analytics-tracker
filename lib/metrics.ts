export type RideMetricInput = {
  movingTimeSeconds: number;
  averagePowerWatts: number | null;
  normalizedPowerWatts: number | null;
  averageHeartRateBpm: number | null;
  ftpWatts: number | null;
};

export type SubjectiveRecovery = {
  sleepQuality?: number;
  legFreshness?: "fresh" | "normal" | "heavy" | "dead";
  kneePain?: number;
  soreness?: number;
};

export type RecoveryRecommendation = {
  minimumHours: number;
  maximumHours: number;
  status: "low fatigue" | "moderate fatigue" | "high fatigue" | "pain flag";
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

const round = (value: number, digits = 1) => {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
};

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
  if ((subjective.kneePain ?? 0) >= 3) {
    return {
      minimumHours: 24,
      maximumHours: 48,
      status: "pain flag",
      nextSession: "No hard riding. Rest or easy spinning only; reassess symptoms.",
      reasons: [
        `Knee pain is ${subjective.kneePain}/10`,
        "Pain overrides the numerical readiness estimate",
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
  if ((subjective.soreness ?? 0) >= 6) {
    minimumHours += 8;
    maximumHours += 12;
    reasons.push(`General soreness is ${subjective.soreness}/10`);
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

export function formatDuration(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  if (hours > 0) return `${hours}h ${minutes.toString().padStart(2, "0")}m`;
  return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
}
