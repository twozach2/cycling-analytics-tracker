export type PowerBest = { durationSeconds: number; bestPowerWatts: number };

export type CyclingVo2Effort = {
  startedAt: string;
  fiveMinutePowerWatts: number;
  weightKg: number;
};

export type CyclingVo2Trend = {
  estimateMlKgMin: number | null;
  fiveMinutePowerWatts: number | null;
  wattsPerKg: number | null;
  changeMlKgMin: number | null;
  changePercent: number | null;
  status: "insufficient" | "provisional" | "trend_ready";
  effortCount: number;
  measuredAt: string | null;
  points: Array<{ startedAt: string; estimateMlKgMin: number }>;
};

const VO2_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;

export function estimateCyclingVo2Max(fiveMinutePowerWatts: number, weightKg: number) {
  if (!Number.isFinite(fiveMinutePowerWatts) || fiveMinutePowerWatts <= 0 || !Number.isFinite(weightKg) || weightKg <= 0) return null;
  return Math.round((16.6 + (8.87 * (fiveMinutePowerWatts / weightKg))) * 10) / 10;
}

export function buildCyclingVo2Trend(efforts: CyclingVo2Effort[], currentFtpWatts: number | null): CyclingVo2Trend {
  const valid = efforts
    .map((effort) => ({
      ...effort,
      timestamp: Date.parse(effort.startedAt),
      estimateMlKgMin: estimateCyclingVo2Max(effort.fiveMinutePowerWatts, effort.weightKg),
    }))
    .filter((effort): effort is typeof effort & { estimateMlKgMin: number } => (
      Number.isFinite(effort.timestamp) && effort.estimateMlKgMin !== null
    ))
    .sort((a, b) => a.timestamp - b.timestamp);

  if (!valid.length) {
    return {
      estimateMlKgMin: null,
      fiveMinutePowerWatts: null,
      wattsPerKg: null,
      changeMlKgMin: null,
      changePercent: null,
      status: "insufficient",
      effortCount: 0,
      measuredAt: null,
      points: [],
    };
  }

  const anchorMs = valid.at(-1)!.timestamp;
  const currentWindow = valid.filter((effort) => effort.timestamp > anchorMs - VO2_WINDOW_MS);
  const priorWindow = valid.filter((effort) => effort.timestamp <= anchorMs - VO2_WINDOW_MS && effort.timestamp > anchorMs - (2 * VO2_WINDOW_MS));
  const best = (items: typeof valid) => items.reduce((leader, effort) => (
    !leader || effort.estimateMlKgMin > leader.estimateMlKgMin ? effort : leader
  ), null as (typeof valid)[number] | null);
  const currentBest = best(currentWindow)!;
  const priorBest = best(priorWindow);
  const points = valid.map((effort) => {
    const rollingBest = best(valid.filter((candidate) => candidate.timestamp <= effort.timestamp && candidate.timestamp > effort.timestamp - VO2_WINDOW_MS))!;
    return { startedAt: effort.startedAt, estimateMlKgMin: rollingBest.estimateMlKgMin };
  }).slice(-10);
  const changeMlKgMin = priorBest === null
    ? null
    : Math.round((currentBest.estimateMlKgMin - priorBest.estimateMlKgMin) * 10) / 10;
  const changePercent = priorBest === null
    ? null
    : Math.round(((currentBest.estimateMlKgMin - priorBest.estimateMlKgMin) / priorBest.estimateMlKgMin) * 1000) / 10;
  const isStrongFiveMinuteEffort = currentFtpWatts !== null && currentFtpWatts > 0
    && currentBest.fiveMinutePowerWatts >= currentFtpWatts * 1.1;

  return {
    estimateMlKgMin: currentBest.estimateMlKgMin,
    fiveMinutePowerWatts: Math.round(currentBest.fiveMinutePowerWatts),
    wattsPerKg: Math.round((currentBest.fiveMinutePowerWatts / currentBest.weightKg) * 100) / 100,
    changeMlKgMin,
    changePercent,
    status: currentWindow.length >= 2 && isStrongFiveMinuteEffort ? "trend_ready" : "provisional",
    effortCount: currentWindow.length,
    measuredAt: currentBest.startedAt,
    points,
  };
}

export type FtpPrediction = {
  minimumWatts: number | null;
  maximumWatts: number | null;
  midpointWatts: number | null;
  confidence: "insufficient" | "low" | "moderate" | "high";
  signals: string[];
};

const ftpFactors = new Map([
  [1200, 0.95],
  [1800, 0.97],
  [2700, 0.99],
  [3600, 1],
]);

export function predictFtp(powerBests: PowerBest[], currentFtpWatts: number): FtpPrediction {
  const bestByDuration = new Map<number, number>();
  for (const best of powerBests) {
    if (!ftpFactors.has(best.durationSeconds) || !Number.isFinite(best.bestPowerWatts) || best.bestPowerWatts <= 0) continue;
    bestByDuration.set(best.durationSeconds, Math.max(bestByDuration.get(best.durationSeconds) ?? 0, best.bestPowerWatts));
  }
  const candidates = Array.from(bestByDuration, ([durationSeconds, watts]) => ({
    durationSeconds,
    watts,
    estimate: watts * ftpFactors.get(durationSeconds)!,
  })).sort((a, b) => a.estimate - b.estimate);
  if (!candidates.length) {
    return {
      minimumWatts: null,
      maximumWatts: null,
      midpointWatts: null,
      confidence: "insufficient",
      signals: ["A recorded 20–60 minute power effort is needed."],
    };
  }

  const midpoint = Math.round(candidates[Math.floor(candidates.length / 2)].estimate);
  const spread = Math.max(3, Math.round(midpoint * (candidates.length >= 3 ? 0.02 : 0.035)));
  const confidence = candidates.length >= 3 ? "high" : candidates.length === 2 ? "moderate" : "low";
  const durationLabel = (seconds: number) => seconds >= 3600 ? `${seconds / 3600}h` : `${seconds / 60}m`;
  const signals = candidates
    .sort((a, b) => a.durationSeconds - b.durationSeconds)
    .map((candidate) => `${durationLabel(candidate.durationSeconds)} best: ${Math.round(candidate.watts)} W`);
  if (Math.abs(midpoint - currentFtpWatts) <= 3) signals.push(`Consistent with configured FTP: ${currentFtpWatts} W`);

  return {
    minimumWatts: Math.max(1, midpoint - spread),
    maximumWatts: midpoint + spread,
    midpointWatts: midpoint,
    confidence,
    signals,
  };
}

function addMonths(dateIso: string, months: number) {
  const date = new Date(`${dateIso.slice(0, 10)}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCMonth(date.getUTCMonth() + Math.max(0, Math.ceil(months)));
  return date.toISOString().slice(0, 10);
}

export function projectFtpGoal(currentFtpWatts: number, targetFtpWatts: number, fromDateIso: string) {
  const wattsRemaining = Math.max(0, targetFtpWatts - currentFtpWatts);
  return {
    targetFtpWatts,
    aggressiveDate: addMonths(fromDateIso, wattsRemaining / 4),
    currentTrendDate: addMonths(fromDateIso, wattsRemaining / 2.5),
    conservativeDate: addMonths(fromDateIso, wattsRemaining / 1.5),
    disclaimer: "Scenario estimates based on 4.0, 2.5, and 1.5 watts per month—not a promise of adaptation.",
  };
}

export type PlanningInput = {
  readinessScore: number;
  kneePain: number;
  acuteChronicRatio: number | null;
  recentHardSessions: number;
};

export type WorkoutMode = "rest" | "recovery" | "endurance" | "tempo";

export type WorkoutRecommendation = {
  mode: WorkoutMode;
  primary: string;
  detail: string;
  avoid: string;
};

export function recommendWorkout(input: PlanningInput): WorkoutRecommendation {
  if (input.kneePain >= 3) {
    return { mode: "rest", primary: "Rest or pain-free recovery spin", detail: "No intensity while knee symptoms are elevated.", avoid: "Intervals and forceful low-cadence work" };
  }
  if (input.readinessScore < 40 || (input.acuteChronicRatio ?? 0) > 1.5) {
    return { mode: "rest", primary: "Complete rest", detail: "Let fatigue settle, then reassess the morning check-in.", avoid: "Adding load to rescue the week" };
  }
  if (input.readinessScore < 70 || input.recentHardSessions >= 2) {
    return { mode: "recovery", primary: "Easy Zone 1–2 · 30–50 min", detail: "Conversational effort with smooth 85–90 rpm cadence.", avoid: "Threshold or VO₂ work" };
  }
  return { mode: "tempo", primary: "Tempo development · 3 × 10 min", detail: "Ride controlled tempo with five easy minutes between efforts.", avoid: "Turning the final interval into a maximal test" };
}

export function buildWeeklyPlan(input: PlanningInput) {
  const cautious = input.kneePain >= 3 || input.readinessScore < 55 || (input.acuteChronicRatio ?? 0) > 1.5;
  return cautious ? [
    { day: "Mon", session: "Rest + mobility", purpose: "Absorb recent load" },
    { day: "Tue", session: "Easy spin · 35 min", purpose: "Pain-free movement only" },
    { day: "Wed", session: "Rest", purpose: "Reassess readiness" },
    { day: "Thu", session: "Zone 2 · 45 min", purpose: "Low-cost aerobic work" },
    { day: "Fri", session: "Rest", purpose: "Keep fatigue controlled" },
    { day: "Sat", session: "Endurance · 60 min", purpose: "Extend only if fresh" },
    { day: "Sun", session: "Recovery choice", purpose: "Walk, spin, or rest" },
  ] : [
    { day: "Mon", session: "Recovery · 30 min", purpose: "Reset after the weekend" },
    { day: "Tue", session: "Tempo · 3 × 10 min", purpose: "Sustainable power" },
    { day: "Wed", session: "Rest", purpose: "Absorb quality work" },
    { day: "Thu", session: "Zone 2 · 60 min", purpose: "Aerobic volume" },
    { day: "Fri", session: "Benchmark · 60 min", purpose: "110 W, 85–90 rpm" },
    { day: "Sat", session: "Endurance · 75–90 min", purpose: "Durability" },
    { day: "Sun", session: "Rest", purpose: "Start next week ready" },
  ];
}
