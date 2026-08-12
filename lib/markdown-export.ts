import { buildComparableRouteCohorts, buildZone2BenchmarkCohort, COMPARABILITY_VERSION, evaluateZone2Benchmark, ZONE2_BENCHMARK_VERSION } from "./comparability";
import type { CoachReport } from "./coach";
import type { RideDataQuality } from "./data-quality";
export type MarkdownRide = {
  id: string;
  name: string;
  route: string;
  date: string;
  type: string;
  source: string;
  context?: "ordinary" | "benchmark" | "structured_workout" | "race" | "group_ride";
  rideTypeSource?: string;
  rideContextSource?: string;
  classificationConfidence?: "low" | "moderate" | "high";
  classificationReason?: string;
  classificationVersion?: string;
  indoor: boolean;
  environment?: "virtual" | "indoor" | "outdoor";
  workoutSubtype?: "trainer_workout" | "race" | null;
  distanceMiles: number;
  movingTimeSeconds: number;
  elevationFeet: number;
  averagePower: number;
  maximumPower: number;
  normalizedPower: number | null;
  averageHeartRate: number;
  maximumHeartRate: number;
  averageCadence: number;
  maximumCadence: number;
  trainingLoad: number;
  intensityFactor: number;
  ftpAtRideWatts?: number | null;
  ftpSnapshotSource?: string | null;
  powerHeartRateRatio: number;
  decoupling: number | null;
  decouplingEligible?: boolean;
  decouplingEligibilityReason?: string;
  stoppedPercent?: number | null;
  variabilityIndex: number | null;
  cadenceStddev?: number | null;
  cadenceTargetPercent?: number | null;
  cadenceAcceptablePercent?: number | null;
  cadenceLowPercent?: number | null;
  cadenceHighPercent?: number | null;
  first15HeartRate?: number | null;
  final15HeartRate?: number | null;
  dataQuality?: RideDataQuality;
  note: string;
};

export type MethodDefinition = {
  id: string;
  title: string;
  formula: string;
  note: string;
};

export const METHOD_DEFINITIONS: readonly MethodDefinition[] = [
  { id: "01", title: "Power / HR ratio", formula: "average power ÷ average heart rate", note: "Contextual efficiency signal for comparable steady rides." },
  { id: "02", title: "Intensity factor", formula: "normalized power ÷ FTP at ride date", note: "Every ride keeps its own FTP snapshot; changing today's FTP does not rewrite historical IF or load." },
  { id: "03", title: "Training load", formula: "hours × intensity² × 100", note: "A transparent TSS-like load, not a licensed physiological diagnosis." },
  { id: "04", title: "Aerobic decoupling", formula: "median central-interval efficiency · first half vs second half", note: "Ten equal-duration intervals are formed, with warm-up and cooldown edge buckets excluded. Interpretation requires ≥45 minutes, VI ≤1.08, ≤5% stopped time, a non-workout effort, sufficient paired power/HR samples, and no outsized warm-up signal." },
  { id: "05", title: "Load ratio", formula: "7-day load ÷ 28-day weekly average", note: "A review signal for abrupt changes, never an exact injury threshold." },
  { id: "06", title: "Readiness", formula: "recovery time + load + check-in", note: "A weighted, explainable score. Pain caps the result and overrides hard-ride advice." },
  { id: "07", title: "FTP prediction", formula: "20–60 min best power × duration factor", note: "A conservative range from recorded efforts, with confidence tied to available evidence." },
  { id: "08", title: "Goal scenarios", formula: "watts remaining ÷ monthly scenario", note: "Multiple clearly labeled estimates; never a promised achievement date." },
  { id: "09", title: "Zwift route time", formula: "rider power vs gravity + rolling resistance + aerodynamic drag", note: "A planning range from rider weight, sustainable W/kg, route distance, and total climbing; drafting and exact gradient profiles can change the result." },
  { id: "10", title: "Estimated cycling VO₂ max", formula: "16.6 + 8.87 × five-minute W/kg", note: "A rolling 90-day power-based trend proxy. It assumes the five-minute effort was maximal and is not a laboratory measurement or diagnosis." },
  { id: "11", title: "Ride classification", formula: "explicit intent + provider subtype + FTP-based IF bands", note: "Training stimulus is stored separately from benchmark, workout, race, or group context. Ambiguous summary-only classifications stay conservative, carry confidence and evidence, and never overwrite manual corrections." },
  { id: "12", title: "Comparable ride cohorts", formula: "route + environment + stimulus + context + distance tolerance + complete power/HR", note: "Route changes are shown only inside matched cohorts. Distance must be within 8%; race, group, and structured-workout contexts are excluded. Unobserved outdoor conditions cap confidence at moderate." },
  { id: "13", title: "Controlled Zone 2 benchmark", formula: "50-70 min + IF 0.60-0.75 + VI <= 1.05 + stopped time <= 2% + cadence 80-95 rpm + paired streams", note: "Each ride must pass the full protocol. Comparisons stay in one environment and a narrow IF cohort; a trend is withheld until at least three eligible rides exist." },
  { id: "14", title: "Cadence distribution", formula: "positive cadence samples grouped by band; cohort medians use one result per ride", note: "Cadence is calculated for every ride with a detailed stream. Zero-rpm coasting is excluded; target and endurance bands overlap and are not expected to total 100%. Cross-ride summaries stay separated by environment and training type." },
  { id: "15", title: "Data quality and provenance", formula: "per-signal record counts + source metadata + metric basis", note: "Each signal reports the records actually received, a summary-only value, or unavailable data. The app does not copy the timeline total across signals or invent sample coverage." },
  { id: "16", title: "Coach Mode", formula: "readiness + safety guardrails + workload + evidence quality + mature trends + personal baselines", note: "Recommendations expose supporting and cautionary evidence, carry confidence, withhold training advice for substantial pain or illness, and label future days as conditional." },
];
type MarkdownExportConfig = {
  ftpWatts: number;
  bodyWeightKg: number;
  dataMode: "loading" | "demo" | "saved" | "unavailable";
  coachReport?: CoachReport;
};

const clean = (value: string) => value.replace(/\r?\n/g, " ").replace(/\s+/g, " ").trim() || "Not available";
const finite = (value: number | null | undefined, digits = 0, zeroIsMissing = true) => (
  value === null || value === undefined || !Number.isFinite(value) || (zeroIsMissing && value === 0)
    ? "Not available"
    : value.toFixed(digits)
);
const duration = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds <= 0) return "Not available";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = Math.round(seconds % 60);
  return hours > 0
    ? `${hours}h ${minutes}m ${remainingSeconds}s`
    : `${minutes}m ${remainingSeconds}s`;
};

export function buildCyclingMarkdown(
  rides: readonly MarkdownRide[],
  config: MarkdownExportConfig,
  generatedAt = new Date(),
): string {
  const sortedRides = [...rides].sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
  const bodyWeightPounds = config.bodyWeightKg * 2.2046226218;
  const totalSeconds = sortedRides.reduce((sum, ride) => sum + Math.max(0, ride.movingTimeSeconds), 0);
  const sourceLabel = config.dataMode === "saved" ? "Saved rider data" : "Fictional demo data";
  const comparisonRides = sortedRides.map((ride) => ({
    ...ride,
    environment: ride.environment ?? (ride.indoor ? "indoor" : "outdoor"),
    trainingType: ride.type,
    context: ride.context ?? "ordinary",
  }));
  const routeComparison = buildComparableRouteCohorts(comparisonRides);
  const benchmarkCandidates = comparisonRides.filter((ride) => ride.context === "benchmark");
  const benchmarkCohort = buildZone2BenchmarkCohort(benchmarkCandidates.map((ride) => ({
    ...ride,
    date: ride.date,
    decouplingEligible: ride.decouplingEligible ?? false,
    stoppedPercent: ride.stoppedPercent ?? null,
  })));
  const lines = [
    "# Cycling Analytics Export",
    "",
    `Generated: ${generatedAt.toISOString()}`,
    `Data status: ${sourceLabel}`,
    "",
    "## Rider configuration",
    "",
    `- FTP: ${Math.round(config.ftpWatts)} W`,
    `- Body weight: ${bodyWeightPounds.toFixed(0)} lb (${config.bodyWeightKg.toFixed(1)} kg)`,
    `- FTP power-to-weight: ${(config.ftpWatts / config.bodyWeightKg).toFixed(2)} W/kg`,
    `- Zone 2 reference: ${Math.round(config.ftpWatts * 2 / 3)} W`,
    "- Preferred cadence band: 85–90 rpm",
    "- Zwift route-time assumption: approximately 1.0–1.2 W/kg average, capped below FTP",
    "",
    "## Export summary",
    "",
    `- Rides: ${sortedRides.length}`,
    `- Total moving time: ${duration(totalSeconds)}`,
    "",
    "## Method",
    "",
    ...METHOD_DEFINITIONS.flatMap((method) => [
      `### ${method.id} · ${method.title}`,
      "",
      `- Formula: \`${method.formula}\``,
      `- Interpretation: ${method.note}`,
      "",
    ]),
    "## Comparability audit",
    "",
    `- Route comparison version: ${COMPARABILITY_VERSION}`,
    `- Zone 2 benchmark version: ${ZONE2_BENCHMARK_VERSION}`,
    `- Comparable route cohorts: ${routeComparison.cohorts.length}`,
    `- Route rides excluded: ${routeComparison.excluded.length}`,
    `- Eligible controlled Zone 2 benchmarks: ${benchmarkCohort.rides.length}`,
    `- Benchmark trend ready: ${benchmarkCohort.trendReady ? "Yes" : "No"}`,
    `- Benchmark confidence: ${benchmarkCohort.confidence}`,
    ...routeComparison.cohorts.map((cohort) => `- Route cohort: ${clean(cohort.rides[0].route)} | ${cohort.rides.length} rides | ${cohort.confidence} confidence | ${cohort.reasons.join(" ")}`),
    "",
    "## Ride log",
    ...(config.coachReport ? [
      "## Coach Mode snapshot",
      "",
      `- Algorithm: ${config.coachReport.algorithmVersion}`,
      `- State: ${config.coachReport.state}`,
      `- Confidence: ${config.coachReport.confidence}`,
      `- Recommendation: ${config.coachReport.primary}`,
      `- Detail: ${config.coachReport.detail}`,
      `- Avoid: ${config.coachReport.avoid}`,
      `- Next quality session: ${config.coachReport.nextQualitySession}`,
      `- Check-in recorded: ${config.coachReport.evidenceSummary.checkInRecorded ? "Yes" : "No"}`,
      `- Recent detailed-evidence rides: ${config.coachReport.evidenceSummary.highQualityRides}`,
      `- Today's completed training: ${config.coachReport.evidenceSummary.todayRides} rides · ${config.coachReport.evidenceSummary.todayMinutes} minutes · ${config.coachReport.evidenceSummary.todayTrainingLoad} load · max IF ${config.coachReport.evidenceSummary.todayMaxIntensityFactor.toFixed(2)}`,
      `- Seven-day load: ${config.coachReport.evidenceSummary.acuteLoad}`,
      `- 28-day weekly baseline: ${config.coachReport.evidenceSummary.chronicWeeklyLoad}`,
      `- Workload comparison: ${config.coachReport.evidenceSummary.acuteChronicRatio === null ? "Not available" : `${config.coachReport.evidenceSummary.acuteChronicRatio.toFixed(2)}x`}`,
      `- Ride contribution: ${config.coachReport.rideReflection.contribution}`,
      `- Ride reflection: ${config.coachReport.rideReflection.headline}`,
      `- Contribution detail: ${config.coachReport.rideReflection.detail}`,
      `- Encouragement: ${config.coachReport.rideReflection.encouragement}`,
      `- Friendly next step: ${config.coachReport.rideReflection.nextSuggestion}`,
      `- Endurance trend: ${config.coachReport.trend.summary}`,
      ...config.coachReport.positives.map((reason) => `- Supports: ${reason}`),
      ...config.coachReport.cautions.map((reason) => `- Caution: ${reason}`),
      ...config.coachReport.guardrails.map((reason) => `- Guardrail: ${reason}`),
      "",
    ] : []),
    "",
  ];

  if (!sortedRides.length) lines.push("No rides are currently available.", "");

  sortedRides.forEach((ride) => {
    const environment = ride.environment === "virtual" ? "Virtual / Indoor" : ride.environment === "indoor" || (ride.environment === undefined && ride.indoor) ? "Indoor" : "Outdoor";
    const workoutSubtype = ride.workoutSubtype === "trainer_workout" ? "Trainer Workout" : ride.workoutSubtype === "race" ? "Race" : "None";
    const rideContext = ride.context === "benchmark" ? "Controlled benchmark" : ride.context === "structured_workout" ? "Structured workout" : ride.context === "race" ? "Race" : ride.context === "group_ride" ? "Group ride" : "Ordinary ride";
    const decoupling = ride.decouplingEligible && ride.decoupling !== null
      ? `${finite(ride.decoupling, 1, false)}%`
      : "Not suitable for interpretation";
    const benchmarkEligibility = ride.context === "benchmark" ? evaluateZone2Benchmark({
      id: ride.id,
      date: ride.date,
      trainingType: ride.type,
      context: ride.context,
      environment: ride.environment ?? (ride.indoor ? "indoor" : "outdoor"),
      movingTimeSeconds: ride.movingTimeSeconds,
      averagePower: ride.averagePower,
      averageHeartRate: ride.averageHeartRate,
      averageCadence: ride.averageCadence,
      intensityFactor: ride.intensityFactor,
      variabilityIndex: ride.variabilityIndex,
      stoppedPercent: ride.stoppedPercent ?? null,
      powerHeartRateRatio: ride.powerHeartRateRatio,
      decouplingEligible: ride.decouplingEligible ?? false,
      classificationConfidence: ride.classificationConfidence,
    }) : null;
    const benchmarkStatus = benchmarkEligibility ? benchmarkEligibility.eligible ? `Eligible (${benchmarkEligibility.confidence} confidence)` : `Not eligible - ${benchmarkEligibility.failures.join(" ")}` : "Not designated";
    lines.push(
      `### ${clean(ride.date)} · ${clean(ride.name)}`,
      "",
      `- Ride ID: \`${clean(ride.id)}\``,
      `- Type: ${clean(ride.type)}`,
      `- Context: ${rideContext}`,
      `- Ride type source: ${clean(ride.rideTypeSource ?? "Not available")}`,
      `- Ride context source: ${clean(ride.rideContextSource ?? "Not available")}`,
      `- Classification confidence: ${clean(ride.classificationConfidence ?? "Not available")}`,
      `- Classification evidence: ${clean(ride.classificationReason ?? "Not available")}`,
      `- Classification version: ${clean(ride.classificationVersion ?? "Not available")}`,
      `- Source: ${clean(ride.source)}`,
      `- Route/course: ${clean(ride.route)}`,
      `- Data quality: ${ride.dataQuality?.level ?? "Not available"}`,
      `- Evidence source: ${clean(ride.dataQuality?.sourceLabel ?? "Not available")}`,
      `- Stream mode: ${ride.dataQuality?.streamMode ?? "Not available"}`,
      `- Stored samples: ${ride.dataQuality?.sampleCount?.toLocaleString() ?? "Not available"}`,
      `- Detailed signals: ${ride.dataQuality ? `${ride.dataQuality.recordedStreamCount}/6` : "Not available"}`,
      `- Signal records: ${ride.dataQuality ? ride.dataQuality.signals.map((signal) => `${signal.label} ${signal.recordCount?.toLocaleString() ?? (signal.status === "recorded_summary" ? "summary only" : "not available")}`).join("; ") : "Not available"}`,
      `- Metrics algorithm: ${clean(ride.dataQuality?.metricsAlgorithmVersion ?? "Not available")}`,
      `- Data limitations: ${ride.dataQuality?.limitations.length ? clean(ride.dataQuality.limitations.join(" ")) : "None recorded"}`,
      `- Environment: ${environment}`,
      `- Workout subtype: ${workoutSubtype}`,
      `- Distance: ${finite(ride.distanceMiles, 1)} mi`,
      `- Moving time: ${duration(ride.movingTimeSeconds)}`,
      `- Elevation gain: ${finite(ride.elevationFeet)} ft`,
      `- Average power: ${finite(ride.averagePower)} W`,
      `- Normalized power: ${finite(ride.normalizedPower)} W`,
      `- Maximum power: ${finite(ride.maximumPower)} W`,
      `- Average heart rate: ${finite(ride.averageHeartRate)} bpm`,
      `- Maximum heart rate: ${finite(ride.maximumHeartRate)} bpm`,
      `- Controlled Zone 2 benchmark: ${benchmarkStatus}`,
      `- Average cadence: ${finite(ride.averageCadence)} rpm`,
      `- Maximum cadence: ${finite(ride.maximumCadence)} rpm`,
      `- Cadence distribution basis: Positive cadence samples only; zero-rpm coasting is excluded, and overlapping bands do not total 100%.`,
      `- Training load: ${finite(ride.trainingLoad)}`,
      `- Intensity factor: ${finite(ride.intensityFactor, 3)}`,
      `- FTP at ride: ${finite(ride.ftpAtRideWatts)} W`,
      `- FTP snapshot source: ${clean(ride.ftpSnapshotSource ?? "Not available")}`,
      `- Watts / heartbeat: ${finite(ride.powerHeartRateRatio, 3)}`,
      `- Aerobic decoupling: ${decoupling}`,
      `- Decoupling eligibility: ${ride.decouplingEligible ? "Eligible" : `Not eligible — ${clean(ride.decouplingEligibilityReason ?? "Reason unavailable")}`}`,
      `- Stopped time: ${finite(ride.stoppedPercent, 1, false)}%`,
      `- Variability index: ${finite(ride.variabilityIndex, 3)}`,
      `- Cadence standard deviation: ${finite(ride.cadenceStddev, 1)} rpm`,
      `- Cadence in 85–90 rpm target: ${finite(ride.cadenceTargetPercent, 1, false)}%`,
      `- Cadence in acceptable band: ${finite(ride.cadenceAcceptablePercent, 1, false)}%`,
      `- Cadence below band: ${finite(ride.cadenceLowPercent, 1, false)}%`,
      `- Cadence above band: ${finite(ride.cadenceHighPercent, 1, false)}%`,
      `- First 15-minute heart rate: ${finite(ride.first15HeartRate, 0)} bpm`,
      `- Final 15-minute heart rate: ${finite(ride.final15HeartRate, 0)} bpm`,
      `- Notes: ${clean(ride.note)}`,
      "",
    );
  });

  lines.push("---", "", "Generated by Cycling Analytics. Calculated guidance is informational and not a medical diagnosis.", "");
  return lines.join("\n");
}

export function cyclingMarkdownFilename(generatedAt = new Date()): string {
  return `cycling-analytics-${generatedAt.toISOString().slice(0, 10)}.md`;
}

export function cyclingRideMarkdownFilename(ride: Pick<MarkdownRide, "date" | "name">): string {
  const safeDate = /^\d{4}-\d{2}-\d{2}$/.test(ride.date) ? ride.date : "ride";
  const slug = ride.name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "activity";
  return `cycling-analytics-${safeDate}-${slug}.md`;
}
