export type EvidenceConfidence = "low" | "moderate" | "high";
export type ComparisonEnvironment = "virtual" | "indoor" | "outdoor";
export type ComparisonContext = "ordinary" | "benchmark" | "structured_workout" | "race" | "group_ride";

export const ROUTE_DISTANCE_TOLERANCE_PERCENT = 8;
export const COMPARABILITY_VERSION = "comparability-v1";
export const ZONE2_BENCHMARK_VERSION = "zone2-benchmark-v1";

export const ZONE2_BENCHMARK_PROTOCOL = {
  minimumDurationSeconds: 50 * 60,
  maximumDurationSeconds: 70 * 60,
  minimumIntensityFactor: 0.60,
  maximumIntensityFactor: 0.75,
  maximumVariabilityIndex: 1.05,
  maximumStoppedPercent: 2,
  minimumCadenceRpm: 80,
  maximumCadenceRpm: 95,
  intensityClusterTolerance: 0.03,
  minimumTrendRides: 3,
} as const;

export type ComparableRouteRide = {
  id: string;
  route: string;
  environment: ComparisonEnvironment;
  trainingType: string;
  context: ComparisonContext;
  distanceMiles: number;
  averagePower: number;
  averageHeartRate: number;
  powerHeartRateRatio: number;
  classificationConfidence?: EvidenceConfidence;
};

export type ComparisonExclusion = {
  rideId: string;
  reason: string;
};

export type RouteComparisonCohort<T extends ComparableRouteRide> = {
  key: string;
  rides: T[];
  confidence: Exclude<EvidenceConfidence, "low">;
  distanceSpreadPercent: number;
  reasons: string[];
};

export type RouteComparisonResult<T extends ComparableRouteRide> = {
  cohorts: Array<RouteComparisonCohort<T>>;
  excluded: ComparisonExclusion[];
};

const normalizedRoute = (route: string) => route.trim().toLowerCase().replace(/\s+/g, " ");
const median = (values: readonly number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const percentageDifference = (value: number, reference: number) => reference > 0 ? Math.abs(value - reference) / reference * 100 : Number.POSITIVE_INFINITY;

function routeCandidateFailure(ride: ComparableRouteRide) {
  const route = normalizedRoute(ride.route);
  if (!route || /^(fit|tcx|gpx) upload$/.test(route) || route === "imported activity") {
    return "A specific route/course name is required.";
  }
  if (ride.context !== "ordinary" && ride.context !== "benchmark") {
    return "Race, group-ride, and structured-workout conditions are not treated as repeatable route efforts.";
  }
  if (!Number.isFinite(ride.distanceMiles) || ride.distanceMiles <= 0) {
    return "Distance is unavailable.";
  }
  if (!Number.isFinite(ride.averagePower) || ride.averagePower <= 0 || !Number.isFinite(ride.averageHeartRate) || ride.averageHeartRate <= 0 || !Number.isFinite(ride.powerHeartRateRatio) || ride.powerHeartRateRatio <= 0) {
    return "Comparable route analysis requires average power and heart rate.";
  }
  return null;
}

export function buildComparableRouteCohorts<T extends ComparableRouteRide>(rides: readonly T[]): RouteComparisonResult<T> {
  const excluded: ComparisonExclusion[] = [];
  const baseGroups = new Map<string, T[]>();

  for (const ride of rides) {
    const failure = routeCandidateFailure(ride);
    if (failure) {
      excluded.push({ rideId: ride.id, reason: failure });
      continue;
    }
    const key = [normalizedRoute(ride.route), ride.environment, ride.context].join("::");
    const group = baseGroups.get(key) ?? [];
    group.push(ride);
    baseGroups.set(key, group);
  }

  const cohorts: Array<RouteComparisonCohort<T>> = [];
  for (const [baseKey, group] of baseGroups) {
    const clusters: T[][] = [];
    for (const ride of [...group].sort((a, b) => a.distanceMiles - b.distanceMiles)) {
      const cluster = clusters.find((candidate) => percentageDifference(ride.distanceMiles, median(candidate.map((entry) => entry.distanceMiles))) <= ROUTE_DISTANCE_TOLERANCE_PERCENT + 0.000001);
      if (cluster) cluster.push(ride);
      else clusters.push([ride]);
    }

    for (const [clusterIndex, cluster] of clusters.entries()) {
      if (cluster.length < 2) {
        excluded.push({
          rideId: cluster[0].id,
          reason: `No second ride matched route, environment, context, and distance within ${ROUTE_DISTANCE_TOLERANCE_PERCENT}%.`,
        });
        continue;
      }
      const distanceMedian = median(cluster.map((ride) => ride.distanceMiles));
      const minimumDistance = Math.min(...cluster.map((ride) => ride.distanceMiles));
      const maximumDistance = Math.max(...cluster.map((ride) => ride.distanceMiles));
      const distanceSpreadPercent = distanceMedian > 0 ? (maximumDistance - minimumDistance) / distanceMedian * 100 : 0;
      const hasLimitedClassification = cluster.some((ride) => ride.classificationConfidence !== "high");
      const trainingTypes = [...new Set(cluster.map((ride) => ride.trainingType))];
      const hasMixedTrainingStimulus = trainingTypes.length > 1;
      const confidence: "high" | "moderate" = cluster[0].environment !== "outdoor" && distanceSpreadPercent <= 3 && !hasLimitedClassification && !hasMixedTrainingStimulus ? "high" : "moderate";
      const reasons = [
        hasMixedTrainingStimulus
          ? `Same route, ${cluster[0].environment} environment, and ${cluster[0].context.replaceAll("_", " ")} context; training stimuli differ (${trainingTypes.join(", ")}).`
          : `Same route, ${cluster[0].environment} environment, ${cluster[0].trainingType} stimulus, and ${cluster[0].context.replaceAll("_", " ")} context.`,
        `Distance spread is ${distanceSpreadPercent.toFixed(1)}% (limit ${ROUTE_DISTANCE_TOLERANCE_PERCENT}%).`,
      ];
      if (hasMixedTrainingStimulus) reasons.push("Because training stimulus differs, changes are descriptive only and should not be treated as a fitness trend.");
      if (cluster[0].environment === "outdoor") reasons.push("Outdoor wind, surface, traffic, and drafting conditions are not available, so confidence is capped at moderate.");
      if (hasLimitedClassification) reasons.push("At least one ride has less than high classification confidence.");
      cohorts.push({
        key: `${baseKey}::${clusterIndex}`,
        rides: cluster,
        confidence,
        distanceSpreadPercent,
        reasons,
      });
    }
  }

  cohorts.sort((a, b) => b.rides.length - a.rides.length || a.key.localeCompare(b.key));
  return { cohorts, excluded };
}

export type Zone2BenchmarkRide = {
  id: string;
  date: string;
  trainingType: string;
  context: ComparisonContext;
  environment: ComparisonEnvironment;
  movingTimeSeconds: number;
  averagePower: number;
  averageHeartRate: number;
  averageCadence: number;
  intensityFactor: number;
  variabilityIndex: number | null;
  stoppedPercent: number | null;
  powerHeartRateRatio: number;
  decouplingEligible: boolean;
  decouplingConfidence?: EvidenceConfidence;
  classificationConfidence?: EvidenceConfidence;
};

export type BenchmarkEligibility = {
  eligible: boolean;
  confidence: EvidenceConfidence;
  reasons: string[];
  failures: string[];
};

export function evaluateZone2Benchmark(ride: Zone2BenchmarkRide): BenchmarkEligibility {
  const failures: string[] = [];
  if (ride.trainingType !== "Zone 2") failures.push("Training stimulus must be Zone 2.");
  if (ride.context !== "benchmark") failures.push("Ride context must be Controlled benchmark.");
  if (ride.movingTimeSeconds < ZONE2_BENCHMARK_PROTOCOL.minimumDurationSeconds || ride.movingTimeSeconds > ZONE2_BENCHMARK_PROTOCOL.maximumDurationSeconds) {
    failures.push("Moving time must be between 50 and 70 minutes.");
  }
  if (!Number.isFinite(ride.intensityFactor) || ride.intensityFactor < ZONE2_BENCHMARK_PROTOCOL.minimumIntensityFactor || ride.intensityFactor > ZONE2_BENCHMARK_PROTOCOL.maximumIntensityFactor) {
    failures.push("Intensity factor must be between 0.60 and 0.75 using the ride-date FTP snapshot.");
  }
  if (ride.variabilityIndex === null || !Number.isFinite(ride.variabilityIndex)) failures.push("Variability index is unavailable.");
  else if (ride.variabilityIndex > ZONE2_BENCHMARK_PROTOCOL.maximumVariabilityIndex) failures.push(`Variability index must be ${ZONE2_BENCHMARK_PROTOCOL.maximumVariabilityIndex.toFixed(2)} or lower.`);
  if (ride.stoppedPercent === null || !Number.isFinite(ride.stoppedPercent)) failures.push("Stopped-time data is unavailable.");
  else if (ride.stoppedPercent > ZONE2_BENCHMARK_PROTOCOL.maximumStoppedPercent) failures.push(`Stopped time must be ${ZONE2_BENCHMARK_PROTOCOL.maximumStoppedPercent}% or lower.`);
  if (!Number.isFinite(ride.averagePower) || ride.averagePower <= 0 || !Number.isFinite(ride.averageHeartRate) || ride.averageHeartRate <= 0 || !Number.isFinite(ride.powerHeartRateRatio) || ride.powerHeartRateRatio <= 0) {
    failures.push("Average power and heart rate are required.");
  }
  if (!Number.isFinite(ride.averageCadence) || ride.averageCadence < ZONE2_BENCHMARK_PROTOCOL.minimumCadenceRpm || ride.averageCadence > ZONE2_BENCHMARK_PROTOCOL.maximumCadenceRpm) {
    failures.push("Average cadence must stay between 80 and 95 rpm.");
  }
  if (!ride.decouplingEligible) failures.push("Detailed paired power and heart-rate data must pass steady-ride durability eligibility.");

  if (failures.length) return { eligible: false, confidence: "low", reasons: [], failures };

  const driftConfidence = ride.decouplingConfidence ?? (ride.movingTimeSeconds >= 60 * 60 ? "high" : ride.movingTimeSeconds >= 45 * 60 ? "moderate" : "low");
  const confidence: EvidenceConfidence = ride.classificationConfidence === "low" || driftConfidence === "low"
    ? "low"
    : ride.environment === "outdoor" || ride.classificationConfidence !== "high" || driftConfidence === "moderate"
      ? "moderate"
      : "high";
  const reasons = [
    "Zone 2 stimulus and Controlled benchmark context are confirmed.",
    `Duration ${Math.round(ride.movingTimeSeconds / 60)} minutes, IF ${ride.intensityFactor.toFixed(2)}, VI ${ride.variabilityIndex!.toFixed(2)}, stopped time ${ride.stoppedPercent!.toFixed(1)}%.`,
    "Power, heart rate, cadence, and paired stream durability checks are complete.",
  ];
  if (driftConfidence !== "high") reasons.push(`Aerobic durability carries ${driftConfidence} duration confidence.`);
  if (ride.environment === "outdoor") reasons.push("Outdoor conditions cap confidence at moderate.");
  return { eligible: true, confidence, reasons, failures: [] };
}

export type Zone2BenchmarkCohort<T extends Zone2BenchmarkRide> = {
  rides: T[];
  environment: ComparisonEnvironment | null;
  trendReady: boolean;
  confidence: EvidenceConfidence;
  reasons: string[];
  excluded: ComparisonExclusion[];
};

export function buildZone2BenchmarkCohort<T extends Zone2BenchmarkRide>(rides: readonly T[]): Zone2BenchmarkCohort<T> {
  const individuallyEligible: T[] = [];
  const excluded: ComparisonExclusion[] = [];
  for (const ride of rides) {
    const result = evaluateZone2Benchmark(ride);
    if (result.eligible) individuallyEligible.push(ride);
    else excluded.push({ rideId: ride.id, reason: result.failures[0] ?? "Benchmark requirements were not met." });
  }

  const baseGroups = new Map<ComparisonEnvironment, T[]>();
  for (const ride of individuallyEligible) {
    const group = baseGroups.get(ride.environment) ?? [];
    group.push(ride);
    baseGroups.set(ride.environment, group);
  }

  const clusters: T[][] = [];
  for (const group of baseGroups.values()) {
    for (const ride of [...group].sort((a, b) => a.intensityFactor - b.intensityFactor)) {
      const cluster = clusters.find((candidate) => candidate[0].environment === ride.environment && Math.abs(ride.intensityFactor - median(candidate.map((entry) => entry.intensityFactor))) <= ZONE2_BENCHMARK_PROTOCOL.intensityClusterTolerance + 0.000001);
      if (cluster) cluster.push(ride);
      else clusters.push([ride]);
    }
  }

  clusters.sort((a, b) => b.length - a.length || Math.max(...b.map((ride) => Date.parse(ride.date))) - Math.max(...a.map((ride) => Date.parse(ride.date))));
  const selected = clusters[0] ?? [];
  const selectedIds = new Set(selected.map((ride) => ride.id));
  for (const ride of individuallyEligible) {
    if (!selectedIds.has(ride.id)) excluded.push({ rideId: ride.id, reason: "Individually eligible, but outside the selected environment and IF-matched benchmark cohort." });
  }

  if (!selected.length) {
    return { rides: [], environment: null, trendReady: false, confidence: "low", reasons: ["No ride currently meets the controlled Zone 2 benchmark protocol."], excluded };
  }

  const ordered = [...selected].sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
  const trendReady = ordered.length >= ZONE2_BENCHMARK_PROTOCOL.minimumTrendRides;
  const intensitySpread = Math.max(...ordered.map((ride) => ride.intensityFactor)) - Math.min(...ordered.map((ride) => ride.intensityFactor));
  const individualConfidences = ordered.map(evaluateZone2Benchmark).map((result) => result.confidence);
  const confidence: EvidenceConfidence = !trendReady
    ? "low"
    : individualConfidences.every((value) => value === "high") && intensitySpread <= 0.020001
      ? "high"
      : "moderate";
  const reasons = [
    `${ordered.length} eligible ${ordered[0].environment} benchmark ride${ordered.length === 1 ? "" : "s"} with IF spread ${intensitySpread.toFixed(2)}.`,
    trendReady ? `Trend threshold met (${ZONE2_BENCHMARK_PROTOCOL.minimumTrendRides} rides).` : `Trend withheld until ${ZONE2_BENCHMARK_PROTOCOL.minimumTrendRides} comparable benchmarks are available.`,
  ];
  return { rides: ordered, environment: ordered[0].environment, trendReady, confidence, reasons, excluded };
}
