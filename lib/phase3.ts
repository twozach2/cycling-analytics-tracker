export type PowerBest = { durationSeconds: number; bestPowerWatts: number };

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

export function recommendWorkout(input: PlanningInput) {
  if (input.kneePain >= 3) {
    return { primary: "Rest or pain-free recovery spin", detail: "No intensity while knee symptoms are elevated.", avoid: "Intervals and forceful low-cadence work" };
  }
  if (input.readinessScore < 40 || (input.acuteChronicRatio ?? 0) > 1.5) {
    return { primary: "Complete rest", detail: "Let fatigue settle, then reassess the morning check-in.", avoid: "Adding load to rescue the week" };
  }
  if (input.readinessScore < 70 || input.recentHardSessions >= 2) {
    return { primary: "Easy Zone 1–2 · 30–50 min", detail: "Conversational effort with smooth 85–90 rpm cadence.", avoid: "Threshold or VO₂ work" };
  }
  return { primary: "Tempo development · 3 × 10 min", detail: "Ride controlled tempo with five easy minutes between efforts.", avoid: "Turning the final interval into a maximal test" };
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
