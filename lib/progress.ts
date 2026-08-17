export const PROGRESS_ANALYTICS_VERSION = "progress-v1";

export type ProgressRange = "all" | "90d" | "6m" | "1y";
export type ProgressEnvironment = "virtual" | "indoor" | "outdoor";

export type ProgressRide = {
  id: string;
  name: string;
  date: string;
  environment: ProgressEnvironment;
  trainingType: string;
  distanceMiles: number;
  movingTimeSeconds: number;
  elevationFeet: number;
  trainingLoad: number;
  averagePower: number;
  normalizedPower: number | null;
  ftpAtRideWatts: number | null;
  averageHeartRate: number;
  averageCadence: number;
  powerHeartRateRatio: number;
};

export type ProgressFilters = {
  range: ProgressRange;
  environment: "all" | ProgressEnvironment;
  trainingType: "all" | string;
};

export type ProgressSummary = {
  rideCount: number;
  movingTimeSeconds: number;
  distanceMiles: number;
  elevationFeet: number;
  trainingLoad: number;
  startDate: string | null;
  endDate: string | null;
};

export type MonthlyProgress = {
  key: string;
  rideCount: number;
  movingTimeSeconds: number;
  distanceMiles: number;
  elevationFeet: number;
  trainingLoad: number;
};

function timestamp(value: string) {
  const result = Date.parse(value);
  return Number.isFinite(result) ? result : null;
}

function rangeStart(range: ProgressRange, referenceDate: Date) {
  if (range === "all") return null;
  const start = new Date(referenceDate);
  if (range === "90d") start.setUTCDate(start.getUTCDate() - 90);
  if (range === "6m") start.setUTCMonth(start.getUTCMonth() - 6);
  if (range === "1y") start.setUTCFullYear(start.getUTCFullYear() - 1);
  return start.getTime();
}

export function filterProgressRides(rides: readonly ProgressRide[], filters: ProgressFilters, referenceDate = new Date()) {
  const start = rangeStart(filters.range, referenceDate);
  return rides
    .filter((ride) => {
      const rideTime = timestamp(ride.date);
      if (rideTime === null || (start !== null && rideTime < start)) return false;
      if (filters.environment !== "all" && ride.environment !== filters.environment) return false;
      if (filters.trainingType !== "all" && ride.trainingType !== filters.trainingType) return false;
      return true;
    })
    .slice()
    .sort((left, right) => timestamp(left.date)! - timestamp(right.date)! || left.id.localeCompare(right.id));
}

export function buildProgressSummary(rides: readonly ProgressRide[]): ProgressSummary {
  const valid = rides.filter((ride) => timestamp(ride.date) !== null).slice().sort((left, right) => timestamp(left.date)! - timestamp(right.date)!);
  return {
    rideCount: valid.length,
    movingTimeSeconds: valid.reduce((sum, ride) => sum + Math.max(0, ride.movingTimeSeconds), 0),
    distanceMiles: valid.reduce((sum, ride) => sum + Math.max(0, ride.distanceMiles), 0),
    elevationFeet: valid.reduce((sum, ride) => sum + Math.max(0, ride.elevationFeet), 0),
    trainingLoad: valid.reduce((sum, ride) => sum + Math.max(0, ride.trainingLoad), 0),
    startDate: valid[0]?.date ?? null,
    endDate: valid.at(-1)?.date ?? null,
  };
}

function monthKey(date: string) {
  const value = new Date(date);
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function buildMonthlyProgress(rides: readonly ProgressRide[]): MonthlyProgress[] {
  const valid = rides.filter((ride) => timestamp(ride.date) !== null).slice().sort((left, right) => timestamp(left.date)! - timestamp(right.date)!);
  if (!valid.length) return [];

  const first = new Date(valid[0].date);
  const last = new Date(valid.at(-1)!.date);
  const cursor = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), 1));
  const finalKey = `${last.getUTCFullYear()}-${String(last.getUTCMonth() + 1).padStart(2, "0")}`;
  const months = new Map<string, MonthlyProgress>();
  while (true) {
    const key = `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, "0")}`;
    months.set(key, { key, rideCount: 0, movingTimeSeconds: 0, distanceMiles: 0, elevationFeet: 0, trainingLoad: 0 });
    if (key === finalKey) break;
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  for (const ride of valid) {
    const month = months.get(monthKey(ride.date));
    if (!month) continue;
    month.rideCount += 1;
    month.movingTimeSeconds += Math.max(0, ride.movingTimeSeconds);
    month.distanceMiles += Math.max(0, ride.distanceMiles);
    month.elevationFeet += Math.max(0, ride.elevationFeet);
    month.trainingLoad += Math.max(0, ride.trainingLoad);
  }
  return [...months.values()];
}

export function describeProgressSelection(rides: readonly ProgressRide[]) {
  const environments = [...new Set(rides.map((ride) => ride.environment))];
  const trainingTypes = [...new Set(rides.map((ride) => ride.trainingType))];
  const focused = rides.length >= 2 && environments.length === 1 && trainingTypes.length === 1;
  return {
    focused,
    environmentCount: environments.length,
    trainingTypeCount: trainingTypes.length,
    label: focused ? `${environments[0]} · ${trainingTypes[0]}` : "Mixed ride contexts",
    detail: focused
      ? "The selection is narrower, but route, temperature, workout structure, and data quality can still affect each point."
      : "These graphs describe all selected rides. Narrow the environment and ride type before interpreting a change as fitness progress.",
  };
}
