export type PowerBest = { durationSeconds: number; bestPowerWatts: number };

export const POWER_RECORDS_ALGORITHM_VERSION = "power-duration-v3";

export type PowerDurationEffort = PowerBest & {
  rideId: string;
  rideName: string;
  startedAt: string;
};

export type PowerRecordEffort = {
  rideId: string;
  rideName: string;
  startedAt: string;
  bestPowerWatts: number;
};

export type PowerDurationRecord = {
  durationSeconds: number;
  label: string;
  allTime: PowerRecordEffort;
  previousRecord: PowerRecordEffort | null;
  best30Days: PowerRecordEffort | null;
  best42Days: PowerRecordEffort | null;
  best90Days: PowerRecordEffort | null;
  improvementWatts: number | null;
  improvementPercent: number | null;
  effortCount: number;
  recordCount: number;
};

export type PowerRecordTimelineEvent = {
  durationSeconds: number;
  label: string;
  effort: PowerRecordEffort;
  previousPowerWatts: number | null;
  improvementWatts: number | null;
  improvementPercent: number | null;
};

export type PowerDurationCurve = {
  window: "all_time" | "42_days" | "90_days";
  label: string;
  points: Array<{ durationSeconds: number; label: string; effort: PowerRecordEffort }>;
};

export type PowerRecordHistory = {
  algorithmVersion: typeof POWER_RECORDS_ALGORITHM_VERSION;
  records: PowerDurationRecord[];
  curves: PowerDurationCurve[];
  timeline: PowerRecordTimelineEvent[];
};

export function powerDurationLabel(durationSeconds: number) {
  if (durationSeconds < 60) return `${durationSeconds}s`;
  if (durationSeconds % 3600 === 0) return `${durationSeconds / 3600}h`;
  return `${durationSeconds / 60}m`;
}

function recordEffort(effort: PowerDurationEffort): PowerRecordEffort {
  return {
    rideId: effort.rideId,
    rideName: effort.rideName,
    startedAt: effort.startedAt,
    bestPowerWatts: Math.round(effort.bestPowerWatts * 10) / 10,
  };
}

function bestEffort(efforts: PowerDurationEffort[]) {
  return efforts.reduce((leader, effort) => {
    if (!leader || effort.bestPowerWatts > leader.bestPowerWatts) return effort;
    if (effort.bestPowerWatts === leader.bestPowerWatts && Date.parse(effort.startedAt) > Date.parse(leader.startedAt)) return effort;
    return leader;
  }, null as PowerDurationEffort | null);
}

export function buildPowerRecordHistory(efforts: PowerDurationEffort[], anchorTime = Date.now()): PowerRecordHistory {
  const valid = efforts.filter((effort) => (
    effort.rideId.length > 0
    && effort.rideName.length > 0
    && Number.isFinite(Date.parse(effort.startedAt))
    && Number.isFinite(effort.durationSeconds)
    && effort.durationSeconds > 0
    && Number.isFinite(effort.bestPowerWatts)
    && effort.bestPowerWatts > 0
  ));
  const grouped = new Map<number, PowerDurationEffort[]>();
  for (const effort of valid) grouped.set(effort.durationSeconds, [...(grouped.get(effort.durationSeconds) ?? []), effort]);
  const timeline: PowerRecordTimelineEvent[] = [];
  const records = Array.from(grouped, ([durationSeconds, durationEfforts]) => {
    const chronological = durationEfforts.sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt) || a.rideId.localeCompare(b.rideId));
    const recordBreakers: PowerDurationEffort[] = [];
    for (const effort of chronological) {
      const leader = recordBreakers.at(-1);
      if (!leader || effort.bestPowerWatts > leader.bestPowerWatts) {
        const previousPowerWatts = leader?.bestPowerWatts ?? null;
        timeline.push({
          durationSeconds,
          label: powerDurationLabel(durationSeconds),
          effort: recordEffort(effort),
          previousPowerWatts,
          improvementWatts: previousPowerWatts === null ? null : Math.round((effort.bestPowerWatts - previousPowerWatts) * 10) / 10,
          improvementPercent: previousPowerWatts === null ? null : Math.round(((effort.bestPowerWatts - previousPowerWatts) / previousPowerWatts) * 1000) / 10,
        });
        recordBreakers.push(effort);
      }
    }
    const allTime = recordBreakers.at(-1)!;
    const previousRecord = recordBreakers.at(-2) ?? null;
    const inWindow = (days: number) => chronological.filter((effort) => {
      const timestamp = Date.parse(effort.startedAt);
      return timestamp <= anchorTime && timestamp >= anchorTime - (days * 24 * 60 * 60 * 1000);
    });
    const best30Days = bestEffort(inWindow(30));
    const best42Days = bestEffort(inWindow(42));
    const best90Days = bestEffort(inWindow(90));
    return {
      durationSeconds,
      label: powerDurationLabel(durationSeconds),
      allTime: recordEffort(allTime),
      previousRecord: previousRecord ? recordEffort(previousRecord) : null,
      best30Days: best30Days ? recordEffort(best30Days) : null,
      best42Days: best42Days ? recordEffort(best42Days) : null,
      best90Days: best90Days ? recordEffort(best90Days) : null,
      improvementWatts: previousRecord === null ? null : Math.round((allTime.bestPowerWatts - previousRecord.bestPowerWatts) * 10) / 10,
      improvementPercent: previousRecord === null ? null : Math.round(((allTime.bestPowerWatts - previousRecord.bestPowerWatts) / previousRecord.bestPowerWatts) * 1000) / 10,
      effortCount: chronological.length,
      recordCount: recordBreakers.length,
    };
  }).sort((a, b) => a.durationSeconds - b.durationSeconds);
  timeline.sort((a, b) => Date.parse(b.effort.startedAt) - Date.parse(a.effort.startedAt) || a.durationSeconds - b.durationSeconds);
  const curve = (
    window: PowerDurationCurve["window"],
    label: string,
    effortForRecord: (record: PowerDurationRecord) => PowerRecordEffort | null,
  ): PowerDurationCurve => ({
    window,
    label,
    points: records.flatMap((record) => {
      const effort = effortForRecord(record);
      return effort ? [{ durationSeconds: record.durationSeconds, label: record.label, effort }] : [];
    }),
  });
  const curves = [
    curve("all_time", "All time", (record) => record.allTime),
    curve("42_days", "Last 42 days", (record) => record.best42Days),
    curve("90_days", "Last 90 days", (record) => record.best90Days),
  ];
  return { algorithmVersion: POWER_RECORDS_ALGORITHM_VERSION, records, curves, timeline };
}

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
  painConcernSeverity: number;
  trainingLoadRatio: number | null;
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
  if (input.painConcernSeverity >= 7) {
    return { mode: "rest", primary: "Rest and address the pain concern", detail: "Do not train through severe, sharp, or worsening pain.", avoid: "Riding until symptoms are appropriately assessed" };
  }
  if (input.painConcernSeverity >= 5) {
    return { mode: "rest", primary: "Rest or pain-free movement", detail: "Skip cycling load today and reassess the concern before training.", avoid: "Intervals and riding through pain" };
  }
  if (input.painConcernSeverity >= 3) {
    return { mode: "recovery", primary: "Easy, pain-free recovery spin · 20–30 min", detail: "Keep resistance light and stop if symptoms increase.", avoid: "Intervals and forceful low-cadence work" };
  }
  if (input.readinessScore < 40 || (input.trainingLoadRatio ?? 0) > 1.5) {
    return { mode: "rest", primary: "Complete rest", detail: "Let fatigue settle, then reassess the morning check-in.", avoid: "Adding load to rescue the week" };
  }
  if (input.readinessScore < 70 || input.recentHardSessions >= 2) {
    return { mode: "recovery", primary: "Easy Zone 1–2 · 30–50 min", detail: "Conversational effort with smooth 85–90 rpm cadence.", avoid: "Threshold or VO₂ work" };
  }
  return { mode: "tempo", primary: "Tempo development · 3 × 10 min", detail: "Ride controlled tempo with five easy minutes between efforts.", avoid: "Turning the final interval into a maximal test" };
}

export function buildWeeklyPlan(input: PlanningInput, startDateIso = new Date().toISOString().slice(0, 10)) {
  const cautious = input.painConcernSeverity >= 3 || input.readinessScore < 55 || (input.trainingLoadRatio ?? 0) > 1.5;
  const schedule = cautious ? [
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
  const parsedStart = new Date(`${startDateIso.slice(0, 10)}T12:00:00.000Z`);
  const start = Number.isNaN(parsedStart.getTime()) ? new Date() : parsedStart;
  const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const plan = Array.from({ length: 7 }, (_, offset) => {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + offset);
    const day = dayLabels[date.getUTCDay()];
    const scheduled = schedule.find((item) => item.day === day)!;
    return {
      ...scheduled,
      dateIso: date.toISOString().slice(0, 10),
      dateLabel: date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }),
    };
  });
  const todayWorkout = recommendWorkout(input);
  plan[0] = { ...plan[0], session: todayWorkout.primary, purpose: todayWorkout.detail };
  return plan;
}
