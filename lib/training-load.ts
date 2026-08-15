import { localDayKey } from "./shared/date";
import { round } from "./shared/math";

export const TRAINING_LOAD_MODEL_VERSION = "training-load-v1";
export const FITNESS_TIME_CONSTANT_DAYS = 42;
export const FATIGUE_TIME_CONSTANT_DAYS = 7;

export type TrainingLoadRide = {
  date: string;
  trainingLoad: number;
};

export type TrainingLoadStatus = "insufficient" | "provisional" | "established";

export type TrainingLoadPoint = {
  date: string;
  dailyLoad: number;
  fitnessLoad: number;
  fatigueLoad: number;
  form: number;
};

export type TrainingLoadModel = {
  algorithmVersion: typeof TRAINING_LOAD_MODEL_VERSION;
  status: TrainingLoadStatus;
  rideCount: number;
  activeDayCount: number;
  historyDays: number;
  minimumHistoryDays: number;
  current: {
    sevenDayLoad: number;
    fitnessLoad: number | null;
    fatigueLoad: number | null;
    form: number | null;
    loadRatio: number | null;
  };
  weeklyTotals: number[];
  points: TrainingLoadPoint[];
  limitations: string[];
};

const dayMs = 86_400_000;
const fitnessAlpha = 1 - Math.exp(-1 / FITNESS_TIME_CONSTANT_DAYS);
const fatigueAlpha = 1 - Math.exp(-1 / FATIGUE_TIME_CONSTANT_DAYS);

function calendarDayNumber(date: Date) {
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / dayMs);
}

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function dayOffset(date: Date, offset: number) {
  const shifted = new Date(date);
  shifted.setDate(shifted.getDate() + offset);
  return shifted;
}

function loadComparisonStatus(ratio: number | null, status: TrainingLoadStatus) {
  if (status === "insufficient") return "History not ready";
  if (status === "provisional") return "Provisional history";
  if (ratio === null) return "No current modeled load";
  if (ratio < 0.8) return "Fatigue below fitness";
  if (ratio <= 1.2) return "Fatigue near fitness";
  if (ratio <= 1.3) return "Fatigue moderately above fitness";
  return "Fatigue elevated vs fitness";
}

export function describeTrainingLoad(model: TrainingLoadModel) {
  return loadComparisonStatus(model.current.loadRatio, model.status);
}

export function buildTrainingLoadModel(
  rides: readonly TrainingLoadRide[],
  referenceDate: string | Date = new Date(),
): TrainingLoadModel {
  const reference = referenceDate instanceof Date ? new Date(referenceDate) : new Date(referenceDate);
  const safeReference = Number.isFinite(reference.getTime()) ? reference : new Date();
  const anchorDay = startOfLocalDay(safeReference);
  const anchorDayNumber = calendarDayNumber(anchorDay);
  const dailyLoads = new Map<string, number>();
  let rideCount = 0;

  const validRideDays: number[] = [];
  for (const ride of rides) {
    const timestamp = Date.parse(ride.date);
    if (!Number.isFinite(timestamp) || timestamp > safeReference.getTime()) continue;
    if (!Number.isFinite(ride.trainingLoad) || ride.trainingLoad < 0) continue;
    const rideDate = new Date(timestamp);
    const key = localDayKey(rideDate);
    if (!key) continue;
    dailyLoads.set(key, (dailyLoads.get(key) ?? 0) + ride.trainingLoad);
    validRideDays.push(calendarDayNumber(rideDate));
    rideCount += 1;
  }

  if (!rideCount) {
    return {
      algorithmVersion: TRAINING_LOAD_MODEL_VERSION,
      status: "insufficient",
      rideCount: 0,
      activeDayCount: 0,
      historyDays: 0,
      minimumHistoryDays: FITNESS_TIME_CONSTANT_DAYS,
      current: { sevenDayLoad: 0, fitnessLoad: null, fatigueLoad: null, form: null, loadRatio: null },
      weeklyTotals: Array(7).fill(0),
      points: [],
      limitations: ["No valid ride load is available yet."],
    };
  }

  const earliestDayNumber = Math.min(...validRideDays);
  const historyDays = Math.max(1, anchorDayNumber - earliestDayNumber + 1);
  const activeDayCount = dailyLoads.size;
  const status: TrainingLoadStatus = historyDays < 14 || activeDayCount < 4
    ? "insufficient"
    : historyDays < FITNESS_TIME_CONSTANT_DAYS || activeDayCount < 8
      ? "provisional"
      : "established";

  let fitnessLoad = 0;
  let fatigueLoad = 0;
  const allPoints: TrainingLoadPoint[] = [];
  for (let index = 0; index < historyDays; index += 1) {
    const date = dayOffset(anchorDay, index - historyDays + 1);
    const key = localDayKey(date);
    const dailyLoad = dailyLoads.get(key) ?? 0;
    fitnessLoad += (dailyLoad - fitnessLoad) * fitnessAlpha;
    fatigueLoad += (dailyLoad - fatigueLoad) * fatigueAlpha;
    allPoints.push({
      date: key,
      dailyLoad: round(dailyLoad),
      fitnessLoad: round(fitnessLoad),
      fatigueLoad: round(fatigueLoad),
      form: round(fitnessLoad - fatigueLoad),
    });
  }

  const loadInDays = (startDaysAgo: number, endDaysAgo: number) => {
    let total = 0;
    for (let daysAgo = startDaysAgo; daysAgo >= endDaysAgo; daysAgo -= 1) {
      total += dailyLoads.get(localDayKey(dayOffset(anchorDay, -daysAgo))) ?? 0;
    }
    return round(total);
  };
  const weeklyTotals = Array.from({ length: 7 }, (_, index) => {
    const weeksAgo = 6 - index;
    return loadInDays((weeksAgo * 7) + 6, weeksAgo * 7);
  });
  const currentFitness = round(fitnessLoad);
  const currentFatigue = round(fatigueLoad);
  const loadRatio = status === "established" && currentFitness > 0
    ? round(currentFatigue / currentFitness, 2)
    : null;
  const ridingDayLabel = `${activeDayCount} riding ${activeDayCount === 1 ? "day" : "days"}`;
  const limitations = status === "insufficient"
    ? [`Needs at least 14 days and 4 riding days; currently ${historyDays} days and ${ridingDayLabel}.`]
    : status === "provisional"
      ? [`The 42-day fitness estimate is still warming up; currently ${historyDays} days and ${ridingDayLabel}.`]
      : [];

  return {
    algorithmVersion: TRAINING_LOAD_MODEL_VERSION,
    status,
    rideCount,
    activeDayCount,
    historyDays,
    minimumHistoryDays: FITNESS_TIME_CONSTANT_DAYS,
    current: {
      sevenDayLoad: weeklyTotals.at(-1) ?? 0,
      fitnessLoad: currentFitness,
      fatigueLoad: currentFatigue,
      form: round(currentFitness - currentFatigue),
      loadRatio,
    },
    weeklyTotals,
    points: allPoints.slice(-56),
    limitations,
  };
}
