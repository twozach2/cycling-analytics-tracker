import { median } from "./shared/math";

export type CadenceEnvironment = "virtual" | "indoor" | "outdoor";

export type CadenceAnalyticsRide = {
  id: string;
  date: string;
  environment: CadenceEnvironment;
  trainingType: string;
  averageCadence: number;
  cadenceStddev?: number | null;
  cadenceAcceptablePercent?: number | null;
};

export type CadenceCohortSummary = {
  key: string;
  label: string;
  rideCount: number;
  medianAverageCadence: number;
  medianAcceptablePercent: number;
  medianCadenceStddev: number | null;
};

const finite = (value: number | null | undefined): value is number => typeof value === "number" && Number.isFinite(value);

export function hasCadenceDistribution(ride: CadenceAnalyticsRide) {
  return finite(ride.averageCadence)
    && ride.averageCadence > 0
    && finite(ride.cadenceAcceptablePercent)
    && ride.cadenceAcceptablePercent >= 0;
}

function summarize(key: string, label: string, rides: readonly CadenceAnalyticsRide[]): CadenceCohortSummary {
  const medianAverageCadence = median(rides.map((ride) => ride.averageCadence)) ?? 0;
  const medianAcceptablePercent = median(rides.map((ride) => ride.cadenceAcceptablePercent).filter(finite)) ?? 0;
  const medianCadenceStddev = median(rides.map((ride) => ride.cadenceStddev).filter(finite));
  return {
    key,
    label,
    rideCount: rides.length,
    medianAverageCadence,
    medianAcceptablePercent,
    medianCadenceStddev,
  };
}

function groupBy<T extends CadenceAnalyticsRide>(rides: readonly T[], select: (ride: T) => string) {
  const groups = new Map<string, T[]>();
  for (const ride of rides) {
    const key = select(ride);
    const group = groups.get(key) ?? [];
    group.push(ride);
    groups.set(key, group);
  }
  return groups;
}

const environmentLabels: Record<CadenceEnvironment, string> = {
  virtual: "Virtual / Indoor",
  indoor: "Indoor",
  outdoor: "Outdoor",
};

export function buildCadenceOverview<T extends CadenceAnalyticsRide>(rides: readonly T[], recentLimit = 10) {
  const available = rides
    .filter(hasCadenceDistribution)
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
  const environmentGroups = groupBy(available, (ride) => ride.environment);
  const trainingTypeGroups = groupBy(available, (ride) => ride.trainingType);
  const environments = (["virtual", "indoor", "outdoor"] as const)
    .filter((environment) => environmentGroups.has(environment))
    .map((environment) => summarize(`environment:${environment}`, environmentLabels[environment], environmentGroups.get(environment)!));
  const trainingTypes = [...trainingTypeGroups.entries()]
    .map(([trainingType, group]) => summarize(`training:${trainingType}`, trainingType, group))
    .sort((a, b) => b.rideCount - a.rideCount || a.label.localeCompare(b.label));

  return {
    available,
    recent: available.slice(0, recentLimit).reverse(),
    environments,
    trainingTypes,
  };
}
