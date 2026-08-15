import { ChangeEvent, DragEvent, useCallback, useEffect, useRef, useState } from "react";
import { themeOptions, type ThemeId } from "@/app/theme";
import { Methodology } from "@/app/views/Methodology";
import { requestJson } from "@/lib/api-client";
import { parseActivityFile, type DetectedActivity } from "@/lib/activity-parser";
import { saveThenRefresh } from "@/lib/import-transaction";
import { buildCadenceOverview, hasCadenceDistribution, type CadenceAnalyticsRide, type CadenceCohortSummary } from "@/lib/cadence";
import { buildComparableRouteCohorts, buildZone2BenchmarkCohort, COMPARABILITY_VERSION, ZONE2_BENCHMARK_PROTOCOL, ZONE2_BENCHMARK_VERSION } from "@/lib/comparability";
import { buildCoachReport, type CoachRide } from "@/lib/coach";
import { assessRideDataQuality, type RideDataQuality } from "@/lib/data-quality";
import { HEART_RATE_ZONES, aggregateHeartRateZones, describeHeartRateDistribution, heartRateZoneRange, type HeartRateZoneDistribution } from "@/lib/heart-rate";
import {
  calculateReadiness,
  DECOUPLING_PROTOCOL,
  evaluateDecouplingEligibility,
  deriveRideMetrics,
  elapsedHoursSince,
  formatDuration,
  type BodyCondition,
  type DecouplingConfidence,
  type PainLocation,
  type SubjectiveRecovery,
} from "@/lib/metrics";
import { projectFtpGoal } from "@/lib/phase3";
import { AUTOMATIC_SYNC_INTERVAL_MS, classifyRide, type ClassificationConfidence, type RideContext, type RideTrainingType } from "@/lib/strava-sync";
import { buildCyclingMarkdown, cyclingMarkdownFilename, cyclingRideMarkdownFilename } from "@/lib/markdown-export";
import { buildTrainingLoadModel, describeTrainingLoad } from "@/lib/training-load";
import { recommendZwiftRoutes, ROUTE_INTENSITY_BANDS, ZWIFT_ROUTE_COUNT, ZWIFT_WORLDS } from "@/lib/zwift-routes";
import type { ZwiftRotation } from "@/lib/zwift-world-rotation";

type View = "dashboard" | "plan" | "rides" | "import" | "method";
type DataMode = "loading" | "demo" | "saved" | "unavailable";
type RideEnvironment = "virtual" | "indoor" | "outdoor";
type WorkoutSubtype = "trainer_workout" | "race" | null;

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

type Ride = {
  id: string;
  name: string;
  route: string;
  date: string;
  startedAt?: string;
  dateLabel: string;
  dayLabel: string;
  type: RideTrainingType;
  source: "Strava" | "Zwift" | "Upload";
  indoor: boolean;
  environment?: RideEnvironment;
  workoutSubtype?: WorkoutSubtype;
  context?: RideContext;
  rideTypeSource?: string;
  rideContextSource?: string;
  classificationConfidence?: ClassificationConfidence;
  classificationReason?: string;
  classificationVersion?: string;
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
  decouplingConfidence?: DecouplingConfidence;
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
  heartRateZones?: HeartRateZoneDistribution | null;
  note: string;
  dataQuality?: RideDataQuality;
};

const initialRides: Ride[] = [
  {
    id: "ride-aug-06",
    name: "Sunday quality session",
    route: "Watopia · Tempus Fugit",
    date: "2026-08-02",
    dateLabel: "Aug 2",
    dayLabel: "SUN",
    type: "Tempo",
    source: "Zwift",
    indoor: true,
    distanceMiles: 23.4,
    movingTimeSeconds: 5058,
    elevationFeet: 614,
    averagePower: 130,
    maximumPower: 381,
    normalizedPower: 138,
    averageHeartRate: 143,
    maximumHeartRate: 174,
    averageCadence: 87,
    maximumCadence: 111,
    trainingLoad: 99,
    intensityFactor: 0.84,
    powerHeartRateRatio: 0.909,
    decoupling: 4.2,
    variabilityIndex: 1.06,
    note: "Strong final block. Breathing stayed controlled; legs felt heavy afterward.",
  },
  {
    id: "ride-jul-31",
    name: "Friday aerobic benchmark",
    route: "Watopia · Flat Route",
    date: "2026-07-31",
    dateLabel: "Jul 31",
    dayLabel: "FRI",
    type: "Zone 2",
    context: "benchmark",
    source: "Zwift",
    indoor: true,
    environment: "virtual",
    distanceMiles: 17.8,
    movingTimeSeconds: 3600,
    elevationFeet: 282,
    averagePower: 110,
    maximumPower: 128,
    normalizedPower: 112,
    averageHeartRate: 134,
    maximumHeartRate: 145,
    averageCadence: 88,
    maximumCadence: 94,
    trainingLoad: 46,
    intensityFactor: 0.68,
    powerHeartRateRatio: 0.821,
    decoupling: 2.7,
    decouplingEligible: true,
    decouplingEligibilityReason: "Eligible steady ride.",
    stoppedPercent: 0,
    variabilityIndex: 1.02,
    cadenceStddev: 3.8,
    cadenceTargetPercent: 72,
    cadenceAcceptablePercent: 94,
    cadenceLowPercent: 1,
    cadenceHighPercent: 0,
    first15HeartRate: 130,
    final15HeartRate: 138,
    note: "Benchmark complete. Cadence stayed inside the target band for most of the ride.",
  },
  {
    id: "ride-jul-29",
    name: "Recovery spin",
    route: "Watopia · Downtown Titans",
    date: "2026-07-29",
    dateLabel: "Jul 29",
    dayLabel: "WED",
    type: "Recovery",
    source: "Zwift",
    indoor: true,
    distanceMiles: 9.6,
    movingTimeSeconds: 1882,
    elevationFeet: 174,
    averagePower: 82,
    maximumPower: 116,
    normalizedPower: 85,
    averageHeartRate: 116,
    maximumHeartRate: 128,
    averageCadence: 86,
    maximumCadence: 96,
    trainingLoad: 14,
    intensityFactor: 0.52,
    powerHeartRateRatio: 0.707,
    decoupling: null,
    variabilityIndex: 1.04,
    note: "Easy legs-only spin. No pain concerns reported.",
  },
  {
    id: "ride-jul-26",
    name: "Threshold intervals",
    route: "Makuri Islands · Neokyo",
    date: "2026-07-26",
    dateLabel: "Jul 26",
    dayLabel: "SUN",
    type: "Threshold",
    source: "Zwift",
    indoor: true,
    distanceMiles: 18.2,
    movingTimeSeconds: 3974,
    elevationFeet: 486,
    averagePower: 137,
    maximumPower: 422,
    normalizedPower: 153,
    averageHeartRate: 151,
    maximumHeartRate: 181,
    averageCadence: 86,
    maximumCadence: 116,
    trainingLoad: 95,
    intensityFactor: 0.93,
    powerHeartRateRatio: 0.907,
    decoupling: null,
    variabilityIndex: 1.12,
    note: "Completed all intervals. Last effort was difficult but repeatable.",
  },
  {
    id: "ride-jul-24",
    name: "Friday aerobic benchmark",
    route: "Watopia · Flat Route",
    date: "2026-07-24",
    dateLabel: "Jul 24",
    dayLabel: "FRI",
    type: "Zone 2",
    context: "benchmark",
    source: "Zwift",
    indoor: true,
    environment: "virtual",
    distanceMiles: 17.3,
    movingTimeSeconds: 3600,
    elevationFeet: 279,
    averagePower: 110,
    maximumPower: 132,
    normalizedPower: 113,
    averageHeartRate: 137,
    maximumHeartRate: 149,
    averageCadence: 86,
    maximumCadence: 95,
    trainingLoad: 47,
    intensityFactor: 0.68,
    powerHeartRateRatio: 0.803,
    decoupling: 4.8,
    decouplingEligible: true,
    decouplingEligibilityReason: "Eligible steady ride.",
    stoppedPercent: 0,
    variabilityIndex: 1.03,
    cadenceStddev: 4.5,
    cadenceTargetPercent: 61,
    cadenceAcceptablePercent: 88,
    cadenceLowPercent: 3,
    cadenceHighPercent: 1,
    first15HeartRate: 134,
    final15HeartRate: 141,
    note: "Warmer room than usual. Needed more water in the second half.",
  },
];

const powerDuration = [
  { label: "5s", watts: 462, best: 490 },
  { label: "1m", watts: 286, best: 304 },
  { label: "5m", watts: 208, best: 214 },
  { label: "20m", watts: 171, best: 176 },
  { label: "60m", watts: 137, best: 141 },
];

const navItems: Array<{ id: View; label: string; glyph: string }> = [
  { id: "dashboard", label: "Dashboard", glyph: "01" },
  { id: "plan", label: "Coach", glyph: "02" },
  { id: "rides", label: "Ride log", glyph: "03" },
  { id: "import", label: "Import", glyph: "04" },
  { id: "method", label: "Method", glyph: "05" },
];

const UI_PREFERENCES_KEY = "cycling-analytics:ui-preferences";

type UiPreferences = {
  theme?: string;
  view?: string;
  selectedRideId?: string;
  rideFilter?: string;
  search?: string;
};

function readUiPreferences(): UiPreferences {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(UI_PREFERENCES_KEY) ?? "{}") as UiPreferences;
  } catch {
    window.localStorage.removeItem(UI_PREFERENCES_KEY);
    return {};
  }
}

const miles = (meters: number | null) =>
  meters === null ? 0 : Math.round((meters / 1609.344) * 10) / 10;
const feet = (meters: number | null) =>
  meters === null ? 0 : Math.round(meters * 3.28084);
const localDateKey = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const rideStartedAt = (ride: Ride) => ride.startedAt ?? `${ride.date}T12:00:00`;
const isObjectivelyHardRide = (ride: Ride) => ["Tempo", "Sweet Spot", "Threshold", "VO2", "Sprint", "FTP Test"].includes(ride.type) || (ride.intensityFactor >= 0.8 && ride.movingTimeSeconds >= 30 * 60);
type CompletedTraining = { rides: number; trainingLoad: number; movingTimeSeconds: number; maximumIntensityFactor: number };
const completedTrainingOnDate = (rides: readonly Ride[], reference: Date): CompletedTraining => {
  const key = localDateKey(reference);
  const matching = rides.filter((ride) => { const date = new Date(rideStartedAt(ride)); return Number.isFinite(date.getTime()) && localDateKey(date) === key; });
  return {
    rides: matching.length,
    trainingLoad: Math.round(matching.reduce((sum, ride) => sum + Math.max(0, ride.trainingLoad), 0)),
    movingTimeSeconds: matching.reduce((sum, ride) => sum + Math.max(0, ride.movingTimeSeconds), 0),
    maximumIntensityFactor: Math.max(0, ...matching.map((ride) => ride.intensityFactor)),
  };
};


type SavedRideRow = {
  ride: {
    id: string;
    source: string;
    name: string;
    startedAt: string;
    rideType: string;
    rideTypeSource: string;
    rideContext: RideContext;
    rideContextSource: string;
    classificationConfidence: ClassificationConfidence;
    classificationReason: string;
    classificationVersion: string;
    indoor: boolean;
    environment: RideEnvironment;
    workoutSubtype: WorkoutSubtype;
    routeName: string | null;
    distanceM: number | null;
    movingTimeS: number | null;
    elevationGainM: number | null;
    averageHeartRateBpm: number | null;
    maximumHeartRateBpm: number | null;
    averageCadenceRpm: number | null;
    maximumCadenceRpm: number | null;
    averagePowerWatts: number | null;
    maximumPowerWatts: number | null;
    normalizedPowerWatts: number | null;
    normalizedPowerSource: string | null;
    ftpAtRideWatts: number | null;
    ftpSnapshotSource: string | null;
    notes: string;
  };
  metrics: {
    powerHeartRateRatio: number | null;
    intensityFactor: number | null;
    intensityIsEstimated: boolean;
    trainingLoad: number | null;
    trainingLoadIsEstimated: boolean;
    variabilityIndex: number | null;
    aerobicDecouplingPercent: number | null;
    decouplingEligible: boolean;
    decouplingConfidence: DecouplingConfidence;
    decouplingEligibilityReason: string;
    stoppedPercent: number | null;
    cadenceStddev: number | null;
    cadenceTargetPercent: number | null;
    cadenceAcceptablePercent: number | null;
    cadenceLowPercent: number | null;
    cadenceHighPercent: number | null;
    first15HeartRateBpm: number | null;
    final15HeartRateBpm: number | null;
    heartRateThresholdBpm: number | null;
    heartRateSampleCount: number;
    heartRateZone1Percent: number | null;
    heartRateZone2Percent: number | null;
    heartRateZone3Percent: number | null;
    heartRateZone4Percent: number | null;
    heartRateZone5Percent: number | null;
    algorithmVersion: string;
    dataQuality: "high" | "medium" | "low";
  } | null;

  stream: {
    sampleCount: number;
    availableStreamsJson: string;
    streamSampleCountsJson: string;
    encoding: string;
    startedAt: string | null;
    endedAt: string | null;
  } | null;
  sourceFile: {
    filename: string;
    fileType: string;
  } | null;
};

const rideTypes = ["Zone 2", "Recovery", "Tempo", "Sweet Spot", "Threshold", "VO2", "Sprint", "FTP Test", "Free ride"] as const satisfies readonly RideTrainingType[];
const rideContexts: Array<{ value: RideContext; label: string }> = [
  { value: "ordinary", label: "Ordinary ride" },
  { value: "benchmark", label: "Controlled benchmark" },
  { value: "structured_workout", label: "Structured workout" },
  { value: "race", label: "Race" },
  { value: "group_ride", label: "Group ride" },
];
const contextLabel = (context: RideContext | undefined) => rideContexts.find((option) => option.value === context)?.label ?? "Ordinary ride";
const environmentLabel = (environment: RideEnvironment | undefined, indoor = false) => environment === "virtual" ? "Virtual / Indoor" : environment === "indoor" || (environment === undefined && indoor) ? "Indoor" : "Outdoor";
const workoutSubtypeLabel = (subtype: WorkoutSubtype | undefined) => subtype === "trainer_workout" ? "Trainer Workout" : subtype === "race" ? "Race" : null;
const ftpSnapshotLabel = (source: string | null | undefined) => source === "ftp_history" ? "dated FTP history" : source === "current_at_import" ? "current FTP when imported" : source === "legacy_import" ? "original stored snapshot" : "stored ride snapshot";
const cadenceAnalyticsRide = (ride: Ride): CadenceAnalyticsRide => ({
  id: ride.id,
  date: ride.date,
  environment: ride.environment ?? (ride.indoor ? "indoor" : "outdoor"),
  trainingType: ride.type,
  averageCadence: ride.averageCadence,
  cadenceStddev: ride.cadenceStddev,
  cadenceAcceptablePercent: ride.cadenceAcceptablePercent,
});
const qualityForRide = (ride: Ride) => ride.dataQuality ?? assessRideDataQuality({
  source: ride.source === "Strava" ? "strava_export" : ride.source === "Zwift" ? "zwift" : "manual",
  movingTimeSeconds: ride.movingTimeSeconds,
  averagePowerWatts: ride.averagePower,
  averageHeartRateBpm: ride.averageHeartRate,
  averageCadenceRpm: ride.averageCadence,
  distanceMeters: ride.distanceMiles * 1609.344,
  elevationGainMeters: ride.elevationFeet / 3.28084,
  normalizedPowerSource: ride.normalizedPower ? "recorded" : "unavailable",
  intensityIsEstimated: ride.normalizedPower === null,
  trainingLoadIsEstimated: ride.normalizedPower === null,
});
const coachAnalyticsRide = (ride: Ride): CoachRide => ({
  id: ride.id,
  name: ride.name,
  date: rideStartedAt(ride),
  trainingType: ride.type,
  context: ride.context ?? "ordinary",
  environment: ride.environment ?? (ride.indoor ? "indoor" : "outdoor"),
  movingTimeSeconds: ride.movingTimeSeconds,
  trainingLoad: ride.trainingLoad,
  intensityFactor: ride.intensityFactor,
  averagePower: ride.averagePower,
  averageHeartRate: ride.averageHeartRate,
  powerHeartRateRatio: ride.powerHeartRateRatio,
  classificationConfidence: ride.classificationConfidence ?? "low",
  dataQualityLevel: qualityForRide(ride).level,
});


function mapSavedRide({ ride, metrics, stream, sourceFile }: SavedRideRow): Ride {
  const startedAt = new Date(ride.startedAt);
  const safeDate = Number.isNaN(startedAt.getTime()) ? new Date() : startedAt;
  const normalizedRideType = ride.rideType === "Zone 2 benchmark" ? "Zone 2" : ride.rideType;
  const type = rideTypes.includes(normalizedRideType as (typeof rideTypes)[number])
    ? normalizedRideType as Ride["type"]
    : "Free ride";
  const source: Ride["source"] = ride.source === "zwift" ? "Zwift" : ride.source === "strava_export" ? "Strava" : "Upload";
  const sourceLabel = ride.source === "fit" ? "FIT upload" : ride.source === "tcx" ? "TCX upload" : ride.source === "gpx" ? "GPX upload" : "Imported activity";
  const dataQuality = assessRideDataQuality({
    source: ride.source,
    sourceFilename: sourceFile?.filename,
    sourceFileType: sourceFile?.fileType,
    sampleCount: stream?.sampleCount,
    availableStreams: stream?.availableStreamsJson,
    streamSampleCounts: stream?.streamSampleCountsJson,
    movingTimeSeconds: ride.movingTimeS ?? 0,
    averagePowerWatts: ride.averagePowerWatts,
    averageHeartRateBpm: ride.averageHeartRateBpm,
    averageCadenceRpm: ride.averageCadenceRpm,
    distanceMeters: ride.distanceM,
    elevationGainMeters: ride.elevationGainM,
    normalizedPowerSource: ride.normalizedPowerSource,
    intensityIsEstimated: metrics?.intensityIsEstimated,
    trainingLoadIsEstimated: metrics?.trainingLoadIsEstimated,
    storedDataQuality: metrics?.dataQuality,
    metricsAlgorithmVersion: metrics?.algorithmVersion,
  });


  return {
    id: ride.id,
    name: ride.name,
    route: ride.routeName ?? sourceLabel,
    date: safeDate.toISOString().slice(0, 10),
    startedAt: ride.startedAt,
    dateLabel: safeDate.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    dayLabel: safeDate.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase(),
    type,
    source,
    indoor: ride.indoor,
    context: ride.rideContext ?? (ride.rideType === "Zone 2 benchmark" ? "benchmark" : "ordinary"),
    rideTypeSource: ride.rideTypeSource,
    rideContextSource: ride.rideContextSource,
    classificationConfidence: ride.classificationConfidence,
    classificationReason: ride.classificationReason,
    classificationVersion: ride.classificationVersion,
    environment: ride.environment ?? (ride.indoor ? "indoor" : "outdoor"),
    workoutSubtype: ride.workoutSubtype,
    distanceMiles: miles(ride.distanceM),
    movingTimeSeconds: Math.round(ride.movingTimeS ?? 0),
    elevationFeet: feet(ride.elevationGainM),
    averagePower: Math.round(ride.averagePowerWatts ?? 0),
    maximumPower: Math.round(ride.maximumPowerWatts ?? 0),
    normalizedPower: ride.normalizedPowerWatts === null ? null : Math.round(ride.normalizedPowerWatts),
    averageHeartRate: Math.round(ride.averageHeartRateBpm ?? 0),
    maximumHeartRate: Math.round(ride.maximumHeartRateBpm ?? 0),
    averageCadence: Math.round(ride.averageCadenceRpm ?? 0),
    maximumCadence: Math.round(ride.maximumCadenceRpm ?? 0),
    trainingLoad: Math.round(metrics?.trainingLoad ?? 0),
    intensityFactor: metrics?.intensityFactor ?? 0,
    ftpAtRideWatts: ride.ftpAtRideWatts,
    ftpSnapshotSource: ride.ftpSnapshotSource,
    powerHeartRateRatio: metrics?.powerHeartRateRatio ?? 0,
    decoupling: metrics?.aerobicDecouplingPercent ?? null,
    decouplingEligible: metrics?.decouplingEligible ?? false,
    decouplingConfidence: metrics?.decouplingConfidence ?? "none",
    decouplingEligibilityReason: metrics?.decouplingEligibilityReason ?? "Detailed power and heart-rate streams are required.",
    stoppedPercent: metrics?.stoppedPercent ?? null,
    variabilityIndex: metrics?.variabilityIndex ?? null,
    cadenceStddev: metrics?.cadenceStddev ?? null,
    cadenceTargetPercent: metrics?.cadenceTargetPercent ?? null,
    cadenceAcceptablePercent: metrics?.cadenceAcceptablePercent ?? null,
    cadenceLowPercent: metrics?.cadenceLowPercent ?? null,
    cadenceHighPercent: metrics?.cadenceHighPercent ?? null,
    first15HeartRate: metrics?.first15HeartRateBpm ?? null,
    dataQuality,
    final15HeartRate: metrics?.final15HeartRateBpm ?? null,
    heartRateZones: metrics?.heartRateThresholdBpm && metrics.heartRateSampleCount > 0 && metrics.heartRateZone1Percent !== null && metrics.heartRateZone2Percent !== null && metrics.heartRateZone3Percent !== null && metrics.heartRateZone4Percent !== null && metrics.heartRateZone5Percent !== null ? {
      thresholdBpm: metrics.heartRateThresholdBpm,
      sampleCount: metrics.heartRateSampleCount,
      zone1Percent: metrics.heartRateZone1Percent,
      zone2Percent: metrics.heartRateZone2Percent,
      zone3Percent: metrics.heartRateZone3Percent,
      zone4Percent: metrics.heartRateZone4Percent,
      zone5Percent: metrics.heartRateZone5Percent,
    } : null,
    note: ride.notes || (ride.normalizedPowerWatts === null
      ? "Saved from the original activity file. Intensity and load are estimated where recorded power data is unavailable."
      : "Saved from the original activity file with recorded normalized power."),
  };
}

async function fetchSavedRides() {
  const payload = await requestJson<{ rides?: SavedRideRow[] }>(
    "/api/rides",
    { cache: "no-store" },
    "Saved rides could not be loaded.",
  );
  return (payload.rides ?? []).map(mapSavedRide);
}

export default function CyclingDashboard() {
  const [initialPreferences] = useState<UiPreferences>(readUiPreferences);
  const [dashboardNowMs, setDashboardNowMs] = useState(() => Date.now());
  const [view, setView] = useState<View>(() => navItems.some((item) => item.id === initialPreferences.view) ? initialPreferences.view as View : "dashboard");
  const [theme, setTheme] = useState<ThemeId>(() => themeOptions.some((option) => option.id === initialPreferences.theme) ? initialPreferences.theme as ThemeId : "citrus");
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandaloneApp, setIsStandaloneApp] = useState(() => typeof window !== "undefined" && window.matchMedia("(display-mode: standalone)").matches);
  const [rides, setRides] = useState(initialRides);
  const [selectedRideId, setSelectedRideId] = useState(() => initialPreferences.selectedRideId ?? initialRides[0].id);
  const [dataMode, setDataMode] = useState<DataMode>("loading");
  const [currentFtp, setCurrentFtp] = useState<number | null>(null);
  const [currentWeightKg, setCurrentWeightKg] = useState<number | null>(null);
  const [currentLthr, setCurrentLthr] = useState<number | null>(null);
  const [profileStatus, setProfileStatus] = useState<"loading" | "ready" | "error">("loading");
  const [syncNote, setSyncNote] = useState("");
  const [showStravaSettings, setShowStravaSettings] = useState(false);
  const [rideTypeSavingId, setRideTypeSavingId] = useState<string | null>(null);
  const [isReclassifying, setIsReclassifying] = useState(false);
  const [rideFilter, setRideFilter] = useState(() => ["All rides", ...rideTypes].includes(initialPreferences.rideFilter ?? "") ? initialPreferences.rideFilter as string : "All rides");
  const [search, setSearch] = useState(() => initialPreferences.search ?? "");
  const [recovery, setRecovery] = useState<SubjectiveRecovery>({
    sleepQuality: 3,
    legFreshness: "normal",
    bodyCondition: "normal",
    painLocation: "unspecified",
    painSeverity: 0,
    illnessSeverity: 0,
    motivation: 3,
    restingHeartRate: null,
  });
  const [recoverySaveState, setRecoverySaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [restingHeartRateBaseline, setRestingHeartRateBaseline] = useState<number | null>(null);
  const [detected, setDetected] = useState<DetectedActivity | null>(null);
  const [importName, setImportName] = useState("");
  const [importError, setImportError] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [isReading, setIsReading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [rideType, setRideType] = useState<Ride["type"]>("Free ride");
  const [importContext, setImportContext] = useState<RideContext>("ordinary");
  const [routeName, setRouteName] = useState("");
  const [importEnvironment, setImportEnvironment] = useState<RideEnvironment>("outdoor");
  const [importWorkoutSubtype, setImportWorkoutSubtype] = useState<WorkoutSubtype>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    const timer = window.setInterval(() => setDashboardNowMs(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const displayMode = window.matchMedia("(display-mode: standalone)");
    const handleDisplayMode = (event: MediaQueryListEvent) => setIsStandaloneApp(event.matches);
    const handleInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const handleInstalled = () => {
      setIsStandaloneApp(true);
      setInstallPrompt(null);
    };

    displayMode.addEventListener("change", handleDisplayMode);
    window.addEventListener("beforeinstallprompt", handleInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);
    return () => {
      displayMode.removeEventListener("change", handleDisplayMode);
      window.removeEventListener("beforeinstallprompt", handleInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  useEffect(() => {
    window.localStorage.setItem(UI_PREFERENCES_KEY, JSON.stringify({
      theme,
      view,
      selectedRideId,
      rideFilter,
      search,
    }));
  }, [theme, view, selectedRideId, rideFilter, search]);

  useEffect(() => {
    let active = true;
    void fetchSavedRides()
      .then((savedRides) => {
        if (!active) return;
        if (savedRides.length) {
          setRides(savedRides);
          setSelectedRideId((current) => savedRides.some((ride) => ride.id === current) ? current : savedRides[0].id);
          setDataMode("saved");
        } else {
          setDataMode("demo");
        }
      })
      .catch(() => {
        if (active) setDataMode("unavailable");
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    void fetch("/api/phase3", { cache: "no-store" })
      .then(async (response) => ({ response, payload: await response.json() as { currentFtpWatts?: number | null; weightKg?: number | null; lthrBpm?: number | null; error?: string } }))
      .then(({ response, payload }) => {
        if (!active) return;
        if (!response.ok) throw new Error(payload.error ?? "Rider profile could not be loaded.");
        setCurrentFtp(payload.currentFtpWatts ?? null);
        setCurrentWeightKg(payload.weightKg ?? null);
        setCurrentLthr(payload.lthrBpm ?? null);
        setProfileStatus("ready");
      })
      .catch(() => { if (active) setProfileStatus("error"); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (profileStatus !== "ready") return;
    let active = true;
    let inFlight = false;
    const storageKey = "cycling-analytics:last-auto-strava-sync";

    const runAutomaticSync = async () => {
      if (!active || inFlight || document.visibilityState === "hidden") return;
      const previousAttempt = Number(window.localStorage.getItem(storageKey));
      if (Number.isFinite(previousAttempt) && Date.now() - previousAttempt < AUTOMATIC_SYNC_INTERVAL_MS) return;
      inFlight = true;
      try {
        const insightResponse = await fetch("/api/phase3", { cache: "no-store" });
        const insightPayload = await insightResponse.json() as { integrations?: { strava?: { connected?: boolean } } };
        if (!insightResponse.ok || !insightPayload.integrations?.strava?.connected) return;

        const latestAttempt = Number(window.localStorage.getItem(storageKey));
        if (Number.isFinite(latestAttempt) && Date.now() - latestAttempt < AUTOMATIC_SYNC_INTERVAL_MS) return;
        window.localStorage.setItem(storageKey, String(Date.now()));

        const response = await fetch("/api/integrations/strava/sync", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ mode: "new", automatic: true }),
        });
        const payload = await response.json() as { imported?: number; throttled?: boolean; error?: string };
        if (!response.ok) throw new Error(payload.error ?? "Automatic Strava sync failed.");
        if (!active) return;
        if (!payload.throttled) {
          const savedRides = await fetchSavedRides();
          if (!active) return;
          if (savedRides.length) {
            setRides(savedRides);
            setSelectedRideId((current) => savedRides.some((ride) => ride.id === current) ? current : savedRides[0].id);
            setDataMode("saved");
          }
        }
        setSyncNote(payload.imported
          ? `Strava auto-sync · ${payload.imported} new ${payload.imported === 1 ? "ride" : "rides"}`
          : "Strava auto-sync on · Up to date");
      } catch {
        if (active) setSyncNote("Strava auto-sync will retry");
      } finally {
        inFlight = false;
      }
    };

    const visibilityHandler = () => { if (document.visibilityState === "visible") void runAutomaticSync(); };
    void runAutomaticSync();
    const interval = window.setInterval(() => void runAutomaticSync(), AUTOMATIC_SYNC_INTERVAL_MS);
    document.addEventListener("visibilitychange", visibilityHandler);
    return () => {
      active = false;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", visibilityHandler);
    };
  }, [profileStatus]);

  useEffect(() => {
    const url = new URL(window.location.href);
    const integration = url.searchParams.get("integration");
    if (!integration?.startsWith("strava-")) return;
    const messages: Record<string, string> = {
      "strava-connected": "Strava connected · Ready to sync",
      "strava-denied": "Strava connection cancelled",
      "strava-scope": "Strava activity permission was not granted",
      "strava-expired": "Strava connection expired · Try again",
      "strava-failed": "Strava connection failed · Try again",
      "strava-setup": "Strava app credentials still need configuration",
      "strava-invalid": "Strava returned an invalid connection response",
    };
    const timer = window.setTimeout(() => {
      setView("import");
      if (integration === "strava-setup") setShowStravaSettings(true);
      setSyncNote(messages[integration] ?? "Strava connection updated");
      url.searchParams.delete("integration");
      window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    let active = true;
    void fetch("/api/recovery", { cache: "no-store" })
      .then(async (response) => ({
        response,
        payload: await response.json() as {
          recovery?: { sleepQuality?: number; legFreshness?: SubjectiveRecovery["legFreshness"]; motivation?: number; bodyCondition?: BodyCondition | null; painLocation?: PainLocation | null; painSeverity?: number | null; illnessSeverity?: number | null; restingHeartRate?: number | null; generalSoreness?: number; kneePain?: number } | null;
          recordedToday?: boolean;
          restingHeartRateBaseline?: number | null;
        },
      }))
      .then(({ response, payload }) => {
        if (!active || !response.ok) return;
        setRestingHeartRateBaseline(payload.restingHeartRateBaseline ?? null);
        if (!payload.recordedToday || !payload.recovery) return;
        const legacyBodyCondition: BodyCondition = (payload.recovery.kneePain ?? 0) > 0
          ? "pain_concern"
          : (payload.recovery.generalSoreness ?? 0) >= 6
            ? "significant_soreness"
            : (payload.recovery.generalSoreness ?? 0) > 0
              ? "mild_soreness"
              : "normal";
        const bodyCondition = payload.recovery.bodyCondition ?? legacyBodyCondition;
        setRecovery({
          sleepQuality: payload.recovery.sleepQuality ?? 3,
          legFreshness: payload.recovery.legFreshness ?? "normal",
          motivation: payload.recovery.motivation ?? 3,
          bodyCondition,
          painLocation: bodyCondition === "pain_concern"
            ? payload.recovery.painLocation ?? ((payload.recovery.kneePain ?? 0) > 0 ? "knee" : "unspecified")
            : "unspecified",
          painSeverity: bodyCondition === "pain_concern" ? payload.recovery.painSeverity ?? payload.recovery.kneePain ?? 1 : 0,
          illnessSeverity: bodyCondition === "illness" ? payload.recovery.illnessSeverity ?? 1 : 0,
          restingHeartRate: payload.recovery.restingHeartRate ?? null,
        });
        setRecoverySaveState("saved");
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  const saveRecovery = async () => {
    setRecoverySaveState("saving");
    try {
      const response = await fetch("/api/recovery", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(recovery),
      });
      const payload = await response.json() as { restingHeartRateBaseline?: number | null; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Recovery check-in could not be saved.");
      setRestingHeartRateBaseline(payload.restingHeartRateBaseline ?? restingHeartRateBaseline);
      setRecoverySaveState("saved");
    } catch {
      setRecoverySaveState("error");
    }
  };
  const selectedRide = rides.find((ride) => ride.id === selectedRideId) ?? rides[0];
  const filteredRides = rides.filter((ride) => {
    const matchesType = rideFilter === "All rides" || ride.type === rideFilter;
    const query = search.trim().toLowerCase();
    const matchesSearch = !query || `${ride.name} ${ride.route}`.toLowerCase().includes(query);
    return matchesType && matchesSearch;
  });

  const openRide = (ride: Ride) => {
    setSelectedRideId(ride.id);
    setView("dashboard");
  };

  const changeRideType = async (ride: Ride, nextType: Ride["type"]) => {
    if (ride.type === nextType) return;
    if (dataMode !== "saved") {
      setRides((current) => current.map((entry) => entry.id === ride.id ? { ...entry, type: nextType, rideTypeSource: "manual", classificationConfidence: "high", classificationReason: "Manually classified in the demo preview.", classificationVersion: "manual-v1" } : entry));
      setSyncNote("Demo ride type changed · Not saved");
      return;
    }
    setRideTypeSavingId(ride.id);
    try {
      const response = await fetch("/api/rides", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rideId: ride.id, rideType: nextType }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Ride type could not be saved.");
      setRides((current) => current.map((entry) => entry.id === ride.id ? { ...entry, type: nextType, rideTypeSource: "manual", classificationConfidence: "high", classificationReason: "Manually classified by the rider.", classificationVersion: "manual-v1" } : entry));
      setSyncNote(`${ride.name} · ${nextType} saved`);
    } catch (error) {
      setSyncNote(error instanceof Error ? error.message : "Ride type could not be saved.");
    } finally {
      setRideTypeSavingId(null);
    }
  };

  const changeRideContext = async (ride: Ride, nextContext: RideContext) => {
    if (ride.context === nextContext) return;
    if (dataMode !== "saved") {
      setRides((current) => current.map((entry) => entry.id === ride.id ? {
        ...entry,
        context: nextContext,
        rideContextSource: "manual",
        classificationConfidence: "high",
        classificationReason: "Manually classified in the demo preview.",
        classificationVersion: "manual-v1",
      } : entry));
      setSyncNote("Demo context changed - not saved");
      return;
    }
    setRideTypeSavingId(ride.id);
    try {
      const response = await fetch("/api/rides", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rideId: ride.id, rideContext: nextContext }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Ride context could not be saved.");
      setRides((current) => current.map((entry) => entry.id === ride.id ? { ...entry, context: nextContext, rideContextSource: "manual", classificationConfidence: "high", classificationReason: "Manually classified by the rider.", classificationVersion: "manual-v1" } : entry));
      setSyncNote(`${ride.name} context saved`);
    } catch (error) {
      setSyncNote(error instanceof Error ? error.message : "Ride context could not be saved.");
    } finally {
      setRideTypeSavingId(null);
    }
  };

  const handleFiles = async (files: FileList | File[]) => {
    const file = files[0];
    if (!file) return;
    setImportError("");
    setDetected(null);
    setImportName(file.name);
    setPendingFile(file);
    setRideType("Free ride");
    setImportContext("ordinary");
    setRouteName(file.name.replace(/\.(fit|tcx|gpx)$/i, "").replace(/[_-]+/g, " "));
    setIsReading(true);
    try {
      const parsed = await parseActivityFile(file, currentLthr);
      setDetected(parsed);
      setImportEnvironment(parsed.environment);
      setImportWorkoutSubtype(parsed.workoutSubtype);
      const classificationPower = parsed.normalizedPower ?? parsed.averagePower;
      const automaticClassification = classifyRide({
        name: parsed.name,
        workoutSubtype: parsed.workoutSubtype,
        intensityFactor: currentFtp && classificationPower ? classificationPower / currentFtp : null,
        movingTimeSeconds: parsed.movingTimeSeconds,
        variabilityIndex: parsed.variabilityIndex,
      });
      setRideType(automaticClassification.trainingType);
      setImportContext(automaticClassification.context);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "The activity could not be read.");
    } finally {
      setIsReading(false);
    }
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) void handleFiles(event.target.files);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    void handleFiles(event.dataTransfer.files);
  };

  const loadDemoImport = () => {
    setImportName("morning-zone-2.tcx");
    setImportError("");
    setPendingFile(null);
    setRideType("Zone 2");
    setImportContext("benchmark");
    setRouteName("Watopia · Flat Route");
    setImportEnvironment("virtual");
    setImportWorkoutSubtype(null);
    setDetected({
      name: "Morning Zone 2",
      startedAt: "2026-08-06T13:10:00.000Z",
      distanceMeters: 29242,
      movingTimeSeconds: 3672,
      elapsedTimeSeconds: 3672,
      elevationGainMeters: 91,
      averageHeartRate: 132,
      maximumHeartRate: 146,
      averageCadence: 88,
      maximumCadence: 97,
      averagePower: 112,
      maximumPower: 148,
      normalizedPower: 114,
      normalizedPowerSource: "recorded",
      sourceTrainingLoad: 48,
      aerobicDecouplingPercent: 2.4,
      pairedSampleCount: 3672,
      pairedCoveragePercent: 100,
      variabilityIndex: 1.02,
      cadenceStddev: 4.1,
      cadenceTargetPercent: 64,
      cadenceAcceptablePercent: 91,
      cadenceLowPercent: 2,
      cadenceHighPercent: 1,
      first15HeartRate: 128,
      final15HeartRate: 135,
      heartRateZones: null,
      powerDuration: [
        { durationSeconds: 300, bestPowerWatts: 128 },
        { durationSeconds: 1200, bestPowerWatts: 118 },
        { durationSeconds: 3600, bestPowerWatts: 112 },
      ],
      sampleCount: 3672,
      streamSampleCounts: { time: 3672, watts: 3672, heartrate: 3672, cadence: 3672, distance: 3672, altitude: 3672 },
      environment: "virtual",
      workoutSubtype: null,
      warnings: [],
    });
  };

  const resetImport = () => {
    setDetected(null);
    setImportName("");
    setImportError("");
    setPendingFile(null);
    setRouteName("");
    setImportEnvironment("outdoor");
    setImportWorkoutSubtype(null);
    setImportContext("ordinary");
    if (fileInput.current) fileInput.current.value = "";
  };

  const addDetectedRide = async () => {
    if (!detected || currentFtp === null || currentWeightKg === null) return;
    const ftpWatts = currentFtp;
    const weightKg = currentWeightKg;
    setImportError("");
    setIsSaving(true);
    const movingTimeSeconds = Math.round(detected.movingTimeSeconds ?? 0);
    const derived = deriveRideMetrics({
      movingTimeSeconds,
      averagePowerWatts: detected.averagePower,
      normalizedPowerWatts: detected.normalizedPower,
      averageHeartRateBpm: detected.averageHeartRate,
      ftpWatts,
    });
    const elapsedTimeSeconds = Math.max(movingTimeSeconds, Math.round(detected.elapsedTimeSeconds ?? movingTimeSeconds));
    const stoppedPercent = elapsedTimeSeconds > 0 ? Math.max(0, ((elapsedTimeSeconds - movingTimeSeconds) / elapsedTimeSeconds) * 100) : null;
    const driftEligibility = evaluateDecouplingEligibility({
      movingTimeSeconds,
      variabilityIndex: detected.variabilityIndex,
      stoppedPercent,
      pairedSampleCount: detected.pairedSampleCount,
      pairedCoveragePercent: detected.pairedCoveragePercent,
      aerobicDecouplingPercent: detected.aerobicDecouplingPercent,
      isIntervalWorkout: importWorkoutSubtype === "trainer_workout" || ["Sweet Spot", "Threshold", "VO2", "Sprint", "FTP Test"].includes(rideType),
    });
    const date = detected.startedAt ? new Date(detected.startedAt) : new Date();
    const ride: Ride = {
      id: `import-${Date.now()}`,
      name: detected.name,
      route: routeName.trim() || "Imported activity",
      date: date.toISOString().slice(0, 10),
      dateLabel: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      dayLabel: date.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase(),
      type: rideType,
      context: importContext,
      rideTypeSource: "manual",
      rideContextSource: "manual",
      classificationConfidence: "high",
      classificationReason: "Training stimulus and context were selected during import.",
      classificationVersion: "manual-v1",
      source: "Upload",
      indoor: importEnvironment !== "outdoor",
      environment: importEnvironment,
      workoutSubtype: importWorkoutSubtype,
      distanceMiles: miles(detected.distanceMeters),
      movingTimeSeconds,
      elevationFeet: feet(detected.elevationGainMeters),
      averagePower: Math.round(detected.averagePower ?? 0),
      maximumPower: Math.round(detected.maximumPower ?? 0),
      normalizedPower: detected.normalizedPower === null ? null : Math.round(detected.normalizedPower),
      averageHeartRate: Math.round(detected.averageHeartRate ?? 0),
      maximumHeartRate: Math.round(detected.maximumHeartRate ?? 0),
      averageCadence: Math.round(detected.averageCadence ?? 0),
      maximumCadence: Math.round(detected.maximumCadence ?? 0),
      trainingLoad: Math.round(detected.sourceTrainingLoad ?? derived.trainingLoad ?? 0),
      intensityFactor: derived.intensityFactor ?? 0,
      ftpAtRideWatts: ftpWatts,
      ftpSnapshotSource: "current_at_import",
      powerHeartRateRatio: derived.powerHeartRateRatio ?? 0,
      decoupling: detected.aerobicDecouplingPercent,
      decouplingEligible: driftEligibility.eligible,
      decouplingConfidence: driftEligibility.confidence,
      decouplingEligibilityReason: driftEligibility.reason,
      stoppedPercent,
      variabilityIndex: detected.variabilityIndex,
      cadenceStddev: detected.cadenceStddev,
      cadenceTargetPercent: detected.cadenceTargetPercent,
      cadenceAcceptablePercent: detected.cadenceAcceptablePercent,
      cadenceLowPercent: detected.cadenceLowPercent,
      cadenceHighPercent: detected.cadenceHighPercent,
      first15HeartRate: detected.first15HeartRate,
      final15HeartRate: detected.final15HeartRate,
      heartRateZones: detected.heartRateZones,
      note: detected.normalizedPower
        ? detected.normalizedPowerSource === "computed"
          ? "Imported with normalized power computed from the detailed power stream."
          : "Imported from original activity data with recorded normalized power."
        : "Imported from activity data. Intensity and load are explicitly estimated from average power.",
    };
    try {
      if (!pendingFile) {
        setRides((current) => [ride, ...current]);
        setSelectedRideId(ride.id);
        setDataMode("demo");
        setSyncNote("Demo preview · Not saved");
      } else {
        const formData = new FormData();
        formData.set("file", pendingFile);
        const upload = await requestJson<{ sourceFile?: { id: string } }>(
          "/api/import",
          { method: "POST", body: formData },
          "The original activity file could not be saved.",
        );
        const sourceFileId = upload.sourceFile?.id;
        if (!sourceFileId) {
          throw new Error("The original activity file was accepted without a storage reference.");
        }

        const extension = pendingFile.name.split(".").at(-1)?.toLowerCase();
        const persistence = await saveThenRefresh(() => requestJson<{ rideId?: string; duplicate?: boolean; refreshed?: boolean }>("/api/rides", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            sourceFileId,
            source: extension === "fit" || extension === "tcx" || extension === "gpx" ? extension : "manual",
            name: detected.name,
            startedAt: detected.startedAt ?? new Date().toISOString(),
            rideType,
            rideContext: importContext,
            environment: importEnvironment,
            workoutSubtype: importWorkoutSubtype,
            routeName: routeName.trim() || null,
            distanceM: detected.distanceMeters,
            movingTimeS: movingTimeSeconds,
            elapsedTimeS: detected.elapsedTimeSeconds,
            elevationGainM: detected.elevationGainMeters,
            averageHeartRateBpm: detected.averageHeartRate,
            maximumHeartRateBpm: detected.maximumHeartRate,
            averageCadenceRpm: detected.averageCadence,
            maximumCadenceRpm: detected.maximumCadence,
            averagePowerWatts: detected.averagePower,
            maximumPowerWatts: detected.maximumPower,
            normalizedPowerWatts: detected.normalizedPower,
            normalizedPowerSource: detected.normalizedPowerSource,
            ftpAtRideWatts: ftpWatts,
            weightAtRideKg: weightKg,
            sourceTrainingLoad: detected.sourceTrainingLoad,
            aerobicDecouplingPercent: detected.aerobicDecouplingPercent,
            variabilityIndex: detected.variabilityIndex,
            cadenceStddev: detected.cadenceStddev,
            cadenceTargetPercent: detected.cadenceTargetPercent,
            cadenceAcceptablePercent: detected.cadenceAcceptablePercent,
            cadenceLowPercent: detected.cadenceLowPercent,
            cadenceHighPercent: detected.cadenceHighPercent,
            first15HeartRateBpm: detected.first15HeartRate,
            final15HeartRateBpm: detected.final15HeartRate,
            heartRateZones: detected.heartRateZones,
            pairedSampleCount: detected.pairedSampleCount,
            pairedCoveragePercent: detected.pairedCoveragePercent,
            sampleCount: detected.sampleCount,
            streamSampleCounts: detected.streamSampleCounts,
            availableStreams: Object.entries(detected.streamSampleCounts).filter(([, count]) => count > 0).map(([stream]) => stream),
            powerDuration: detected.powerDuration,
          }),
        }, "The ride could not be added to your log."), async () => {
          const savedRides = await fetchSavedRides();
          if (!savedRides.length) throw new Error("The refreshed log was unexpectedly empty.");
          return savedRides;
        });
        const saved = persistence.saved;

        if (persistence.status === "saved") {
          setRides(persistence.refreshed);
          setSelectedRideId(saved.rideId ?? persistence.refreshed[0].id);
          setSyncNote(saved.refreshed ? "Existing ride found · Analytics refreshed" : "Saved just now · Private");
        } else {
          const locallyConfirmedRide = { ...ride, id: saved.rideId ?? ride.id };
          setRides((current) => [locallyConfirmedRide, ...current.filter((entry) => entry.id !== locallyConfirmedRide.id)]);
          setSelectedRideId(locallyConfirmedRide.id);
          setSyncNote("Ride saved · Full log refresh will retry when the app reloads");
        }
        setDataMode("saved");
      }
      setView("dashboard");
      resetImport();
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "The ride could not be saved.");
    } finally {
      setIsSaving(false);
    }
  };

  const syncLabel = dataMode === "loading"
    ? "Loading saved rides…"
    : dataMode === "saved"
      ? syncNote || "Saved rides · Private"
      : syncNote || (dataMode === "unavailable" ? "Demo data · Save unavailable" : "Demo data · Not saved");

  const refreshSavedRides = async () => {
    const savedRides = await fetchSavedRides();
    if (savedRides.length) {
      setRides(savedRides);
      setSelectedRideId(savedRides[0].id);
      setDataMode("saved");
    }
  };

  const reclassifyAutomaticRides = async () => {
    if (dataMode !== "saved") {
      setSyncNote("Automatic reclassification is available for saved rides.");
      return;
    }
    setIsReclassifying(true);
    try {
      const response = await fetch("/api/rides", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "reclassify_automatic" }),
      });
      const payload = await response.json() as { updated?: number; preserved?: number; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Rides could not be reclassified.");
      await refreshSavedRides();
      setSyncNote(`${payload.updated ?? 0} automatic rides reclassified; ${payload.preserved ?? 0} manual rides preserved`);
    } catch (error) {
      setSyncNote(error instanceof Error ? error.message : "Rides could not be reclassified.");
    } finally {
      setIsReclassifying(false);
    }
  };

  const downloadMarkdown = (exportRides: readonly Ride[], filename: string, message: string, generatedAt = new Date()) => {
    if (currentFtp === null || currentWeightKg === null) return;
    const referenceMs = generatedAt.getTime();
    const trainingLoad = buildTrainingLoadModel(
      rides.map((ride) => ({ date: rideStartedAt(ride), trainingLoad: ride.trainingLoad })),
      generatedAt,
    );
    const todayTraining = completedTrainingOnDate(rides, generatedAt);
    const latestHardRide = rides.filter(isObjectivelyHardRide).sort((a, b) => Date.parse(rideStartedAt(b)) - Date.parse(rideStartedAt(a)))[0];
    const snapshotReadiness = calculateReadiness({
      hoursSinceLastHardRide: elapsedHoursSince(latestHardRide ? rideStartedAt(latestHardRide) : null, referenceMs),
      trainingLoadRatio: trainingLoad.current.loadRatio,
      subjective: recovery,
      todayTrainingLoad: todayTraining.trainingLoad,
      todayIntensityFactor: todayTraining.maximumIntensityFactor,
      todayMovingTimeSeconds: todayTraining.movingTimeSeconds,
      restingHeartRateBaseline,
      checkInRecorded: recoverySaveState === "saved",
    });
    const coachReport = buildCoachReport({
      rides: rides.map(coachAnalyticsRide),
      readinessScore: snapshotReadiness.score,
      subjective: recovery,
      checkInRecorded: recoverySaveState === "saved",
      referenceDate: generatedAt,
    });

    const markdown = buildCyclingMarkdown(exportRides, {
      ftpWatts: currentFtp,
      bodyWeightKg: currentWeightKg,
      lthrBpm: currentLthr,
      dataMode,
      coachReport,
    }, generatedAt);
    const url = URL.createObjectURL(new Blob(["\uFEFF", markdown], { type: "text/markdown;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    setSyncNote(message);
  };

  const exportMarkdown = () => {
    const generatedAt = new Date();
    downloadMarkdown(rides, cyclingMarkdownFilename(generatedAt), `${rides.length} rides exported · Markdown`, generatedAt);
  };

  const exportRideMarkdown = (ride: Ride) => {
    downloadMarkdown([ride], cyclingRideMarkdownFilename(ride), `${ride.name} exported · Markdown`);
  };

  const installDesktopApp = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") setIsStandaloneApp(true);
    setInstallPrompt(null);
  };

  const pageMeta: Record<View, { eyebrow: string; title: string }> = {
    dashboard: { eyebrow: "Your training at a glance", title: "Ride with the trend." },
    plan: { eyebrow: "Evidence-gated training guidance", title: "Coach Mode" },
    rides: { eyebrow: "Your complete history", title: "Ride log" },
    import: { eyebrow: "Files + connected sources", title: "Import" },
    method: { eyebrow: "Transparent calculations", title: "Method" },
  };

  if (profileStatus === "loading") {
    return <ProfileGate><span className="eyebrow">Rider setup</span><h1>Loading your profile…</h1><p>Your saved training baseline is being checked.</p></ProfileGate>;
  }

  if (profileStatus === "error") {
    return <ProfileGate><span className="eyebrow">Rider setup</span><h1>Profile unavailable</h1><p>Your saved rider profile could not be loaded.</p><button className="primary-button" type="button" onClick={() => window.location.reload()}>Try again</button></ProfileGate>;
  }

  if (currentFtp === null || currentWeightKg === null) {
    return <RiderSetup
      initialFtp={currentFtp}
      initialWeightKg={currentWeightKg}
      initialLthr={currentLthr}
      onSaved={(ftpWatts, weightKg, lthrBpm) => {
        setCurrentFtp(ftpWatts);
        setCurrentWeightKg(weightKg);
        setCurrentLthr(lthrBpm);
      }}
    />;
  }

  return (
    <main className="app-shell">
      <aside className="side-rail">
        <button className="brand" onClick={() => setView("dashboard")} aria-label="Cycling Analytics home">
          <span className="brand-mark">CA</span>
          <span className="brand-copy"><strong>Cycling</strong><span>Analytics</span></span>
        </button>
        <nav aria-label="Primary navigation">
          {navItems.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${view === item.id ? "active" : ""}`}
              onClick={() => setView(item.id)}
              aria-current={view === item.id ? "page" : undefined}
            >
              <span className="nav-index">{item.glyph}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="athlete-card">
          <div className="athlete-avatar">ZT</div>
          <div><strong>Personal profile</strong><span>FTP {currentFtp} W{currentLthr ? ` · LTHR ${currentLthr} bpm` : ""}</span></div>
        </div>
      </aside>

      <section className="content-shell">
        <header className="topbar">
          <div>
            <span className="eyebrow">{pageMeta[view].eyebrow}</span>
            <h1>{pageMeta[view].title}</h1>
          </div>
          <div className="top-actions">
            <span className={`sync-status mode-${dataMode}`}><i /> {syncLabel}</span>
            <button className="ghost-button export-button" type="button" onClick={exportMarkdown} aria-label="Export all ride data and methodology as Markdown">Export .md <span aria-hidden="true">↓</span></button>
            <button className="primary-button" onClick={() => setView("import")}>Import ride <span>+</span></button>
          </div>
        </header>

        {dataMode !== "saved" && (
          <div className={`data-banner mode-${dataMode}`} role="status">
            <strong>{dataMode === "loading" ? "Checking your private ride log…" : "You’re viewing fictional demo rides."}</strong>
            <span>{dataMode === "loading" ? "Saved activities will appear automatically." : "Import a ride or sync Strava to replace every demo with your own saved data."}</span>
          </div>
        )}

        {view === "dashboard" && <div className="dashboard-stack">
          <Overview selectedRide={selectedRide} rides={rides} openRide={openRide} exportRide={exportRideMarkdown} changeRideType={changeRideType} changeRideContext={changeRideContext} rideTypeSaving={rideTypeSavingId === selectedRide.id} setView={setView} isDemo={dataMode !== "saved"} currentFtp={currentFtp} currentLthr={currentLthr} nowMs={dashboardNowMs} />
          <details className="performance-drawer">
            <summary><span><strong>Performance details</strong><small>Route comparisons, benchmarks, cadence, and workload</small></span><i>+</i></summary>
            <PerformanceDetails rides={rides} currentFtp={currentFtp} currentLthr={currentLthr} nowMs={dashboardNowMs} />
          </details>
        </div>}
        {view === "plan" && <PlanToday
          rides={rides}
          recovery={recovery}
          setRecovery={setRecovery}
          recoverySaveState={recoverySaveState}
          saveRecovery={saveRecovery}
          currentFtp={currentFtp}
          setCurrentFtp={setCurrentFtp}
          currentWeightKg={currentWeightKg}
          setCurrentWeightKg={setCurrentWeightKg}
          currentLthr={currentLthr}
          setCurrentLthr={setCurrentLthr}
          restingHeartRateBaseline={restingHeartRateBaseline}
        />}
        {view === "rides" && (
          <RideLog
            rides={filteredRides}
            allRides={rides}
            filter={rideFilter}
            setFilter={setRideFilter}
            search={search}
            setSearch={setSearch}
            openRide={openRide}
            exportRide={exportRideMarkdown}
            reclassifyAutomaticRides={reclassifyAutomaticRides}
            isReclassifying={isReclassifying}
          />
        )}
        {view === "import" && (
          <div className="import-page-stack">
            <ConnectedSources refreshRides={refreshSavedRides} showSettings={showStravaSettings} />
            <ImportRide
              detected={detected}
              filename={importName}
              error={importError}
              isReading={isReading}
              isSaving={isSaving}
              hasFile={pendingFile !== null}
              rideType={rideType}
              setRideType={setRideType}
              rideContext={importContext}
              setRideContext={setImportContext}
              routeName={routeName}
              setRouteName={setRouteName}
              environment={importEnvironment}
              setEnvironment={setImportEnvironment}
              workoutSubtype={importWorkoutSubtype}
              setWorkoutSubtype={setImportWorkoutSubtype}
              isDragging={isDragging}
              setIsDragging={setIsDragging}
              fileInput={fileInput}
              onFileChange={handleFileChange}
              onDrop={handleDrop}
              onDemo={loadDemoImport}
              onAdd={addDetectedRide}
              onReset={resetImport}
            />
          </div>
        )}
        {view === "method" && <Methodology
          currentFtp={currentFtp}
          currentWeightKg={currentWeightKg}
          currentLthr={currentLthr}
          theme={theme}
          setTheme={setTheme}
          installPromptAvailable={installPrompt !== null}
          isStandaloneApp={isStandaloneApp}
          installDesktopApp={installDesktopApp}
        />}
      </section>
    </main>
  );
}

function ProfileGate({ children }: { children: React.ReactNode }) {
  return (
    <main className="profile-gate-shell">
      <header className="profile-gate-brand"><span className="brand-mark">CA</span><span className="brand-copy"><strong>Cycling</strong><span>Analytics</span></span></header>
      <section className="profile-gate-card panel">{children}</section>
    </main>
  );
}

function RiderSetup({ initialFtp, initialWeightKg, initialLthr, onSaved }: {
  initialFtp: number | null;
  initialWeightKg: number | null;
  initialLthr: number | null;
  onSaved: (ftpWatts: number, weightKg: number, lthrBpm: number | null) => void;
}) {
  const [ftpValue, setFtpValue] = useState(initialFtp === null ? "" : String(initialFtp));
  const [weightValue, setWeightValue] = useState(initialWeightKg === null ? "" : String(Math.round(initialWeightKg * 2.2046226218)));
  const [lthrValue, setLthrValue] = useState(initialLthr === null ? "" : String(initialLthr));
  const [saveState, setSaveState] = useState<"idle" | "saving" | "error">("idle");
  const [message, setMessage] = useState("");
  const [stravaClientId, setStravaClientId] = useState("");
  const [stravaClientSecret, setStravaClientSecret] = useState("");

  const saveProfile = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const ftpWatts = Number(ftpValue);
    const weightPounds = Number(weightValue);
    const lthrBpm = lthrValue.trim() ? Math.round(Number(lthrValue)) : null;
    if (!Number.isFinite(ftpWatts) || ftpWatts < 50 || ftpWatts > 500) {
      setSaveState("error");
      setMessage("Enter an FTP between 50 and 500 watts.");
      return;
    }
    if (!Number.isFinite(weightPounds) || weightPounds < 80 || weightPounds > 500) {
      setSaveState("error");
      setMessage("Enter a body weight between 80 and 500 pounds.");
      return;
    }
    if (lthrBpm !== null && (!Number.isFinite(lthrBpm) || lthrBpm < 80 || lthrBpm > 220)) {
      setSaveState("error");
      setMessage("Enter an LTHR between 80 and 220 bpm, or leave it blank.");
      return;
    }
    if ((stravaClientId.trim() && !stravaClientSecret.trim()) || (!stravaClientId.trim() && stravaClientSecret.trim())) {
      setSaveState("error");
      setMessage("Enter both Strava credentials, or leave both blank and configure Strava later.");
      return;
    }
    setSaveState("saving");
    setMessage("");
    try {
      if (stravaClientId.trim() && stravaClientSecret.trim()) {
        const settingsResponse = await fetch("/api/settings/strava", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ clientId: stravaClientId, clientSecret: stravaClientSecret }),
        });
        const settingsPayload = await settingsResponse.json() as { error?: string };
        if (!settingsResponse.ok) throw new Error(settingsPayload.error ?? "Strava credentials could not be saved.");
      }
      const response = await fetch("/api/phase3", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "record_profile", ftpWatts, weightPounds, lthrBpm }),
      });
      const payload = await response.json() as { ftpWatts?: number; weightKg?: number; lthrBpm?: number | null; error?: string };
      if (!response.ok || payload.ftpWatts === undefined || payload.weightKg === undefined) {
        throw new Error(payload.error ?? "Your rider profile could not be saved.");
      }
      onSaved(payload.ftpWatts, payload.weightKg, payload.lthrBpm ?? null);
    } catch (error) {
      setSaveState("error");
      setMessage(error instanceof Error ? error.message : "Your rider profile could not be saved.");
    }
  };

  return (
    <ProfileGate>
      <span className="eyebrow">Required rider setup</span>
      <h1>Set your training baseline.</h1>
      <p>FTP and body weight are required before the dashboard can calculate training load, power targets, or realistic Zwift route times. LTHR is optional and unlocks personalized heart-rate zones.</p>
      <form className="profile-setup-form" onSubmit={saveProfile}>
        <label><span>Functional threshold power</span><span className="profile-input"><input type="number" min="50" max="500" required value={ftpValue} onChange={(event) => setFtpValue(event.target.value)} /><small>watts</small></span><em>Your current sustainable one-hour power estimate.</em></label>
        <label><span>Body weight</span><span className="profile-input"><input type="number" min="80" max="500" step="1" required value={weightValue} onChange={(event) => setWeightValue(event.target.value)} /><small>lb</small></span><em>Used with FTP for W/kg and climbing estimates.</em></label>
        <label><span>Lactate-threshold heart rate <small>(optional)</small></span><span className="profile-input"><input type="number" min="80" max="220" value={lthrValue} onChange={(event) => setLthrValue(event.target.value)} /><small>bpm</small></span><em>Use a tested or carefully observed LTHR. Leave blank rather than estimating.</em></label>
        <div className="profile-strava-setup">
          <div><strong>Optional Strava setup</strong><span>Create an API application, set its callback domain to <code>127.0.0.1</code>, then paste both values. You can also do this later from Import.</span></div>
          <label><span>Client ID</span><input type="text" autoComplete="off" value={stravaClientId} onChange={(event) => setStravaClientId(event.target.value)} /></label>
          <label><span>Client secret</span><input type="password" autoComplete="new-password" value={stravaClientSecret} onChange={(event) => setStravaClientSecret(event.target.value)} /></label>
        </div>
        <button className="primary-button wide" type="submit" disabled={saveState === "saving"}>{saveState === "saving" ? "Saving…" : "Save and open dashboard"}</button>
        <p className={`profile-setup-message ${saveState}`} role="status">{message}</p>
      </form>
    </ProfileGate>
  );
}

function Overview({ selectedRide, rides, openRide, exportRide, changeRideType, changeRideContext, rideTypeSaving, setView, isDemo, currentFtp, currentLthr, nowMs }: {
  selectedRide: Ride;
  rides: Ride[];
  openRide: (ride: Ride) => void;
  exportRide: (ride: Ride) => void;
  changeRideType: (ride: Ride, nextType: Ride["type"]) => Promise<void>;
  changeRideContext: (ride: Ride, nextContext: RideContext) => Promise<void>;
  rideTypeSaving: boolean;
  setView: (view: View) => void;
  isDemo: boolean;
  currentFtp: number;
  nowMs: number;
  currentLthr: number | null;
}) {
  const dayMs = 24 * 60 * 60 * 1000;
  const anchorMs = nowMs;
  const trainingLoad = buildTrainingLoadModel(
    rides.map((ride) => ({ date: rideStartedAt(ride), trainingLoad: ride.trainingLoad })),
    new Date(anchorMs),
  );
  const ridesInWindow = (startMs: number, endMs: number) => rides.filter((ride) => {
    const timestamp = Date.parse(rideStartedAt(ride));
    return Number.isFinite(timestamp) && timestamp > startMs && timestamp <= endMs;
  });
  const currentWeekRides = ridesInWindow(anchorMs - (7 * dayMs), anchorMs);
  const sevenDayLoad = Math.round(trainingLoad.current.sevenDayLoad);
  const priorWeekLoad = Math.round(trainingLoad.weeklyTotals.at(-2) ?? 0);
  const loadDelta = priorWeekLoad ? Math.round(((sevenDayLoad - priorWeekLoad) / priorWeekLoad) * 100) : null;
  const trainingSeconds = currentWeekRides.reduce((sum, ride) => sum + ride.movingTimeSeconds, 0);
  const trainingLabel = `${Math.floor(trainingSeconds / 3600)}h ${Math.round((trainingSeconds % 3600) / 60).toString().padStart(2, "0")}`;
  const efficiencyRides = rides.filter((ride) => ride.powerHeartRateRatio > 0).slice(0, 7).reverse();
  const efficiencyValues = efficiencyRides.map((ride) => ride.powerHeartRateRatio);
  const efficiencyMax = efficiencyValues.length ? Math.max(...efficiencyValues) : 1;
  const efficiencyScaleMax = Math.max(1, Math.ceil(efficiencyMax * 5) / 5);
  const efficiencyDelta = efficiencyValues.length > 1
    ? ((efficiencyValues.at(-1)! - efficiencyValues[0]) / efficiencyValues[0]) * 100
    : null;
  const currentEfficiency = efficiencyValues.at(-1) ?? 0;
  const wattsHeartRides = rides.filter((ride) => ride.averagePower > 0 && ride.averageHeartRate > 0).slice(0, 7).reverse();
  const wattsScaleMax = Math.max(250, Math.ceil(Math.max(0, ...wattsHeartRides.map((ride) => ride.averagePower)) / 50) * 50);
  const heartRateScaleMax = 200;
  const weeklyLoadValues = trainingLoad.weeklyTotals;
  const loadScale = Math.max(100, ...weeklyLoadValues);
  const selectedPowerData = isDemo ? powerDuration : [
    { label: "Peak", watts: selectedRide.maximumPower, best: selectedRide.maximumPower },
    { label: "Norm", watts: selectedRide.normalizedPower ?? 0, best: selectedRide.normalizedPower ?? 0 },
    { label: "Avg", watts: selectedRide.averagePower, best: selectedRide.averagePower },
  ];
  const powerScale = Math.max(100, ...selectedPowerData.map((entry) => entry.watts));
  const classificationSource = selectedRide.rideTypeSource === "manual" || selectedRide.rideContextSource === "manual" ? "Manual override" : "Automatic";
  const selectedQuality = qualityForRide(selectedRide);
  const selectedHeartRateContext = describeHeartRateDistribution(selectedRide.type, selectedRide.heartRateZones);

  return (
    <div className="dashboard-grid">
      <section className="metric-ribbon">
        <MetricCard label="Current FTP" value={String(currentFtp)} unit="W" change="Used for load estimates" tone="lime" />
        <MetricCard label="7-day load" value={String(sevenDayLoad)} unit="pts" change={loadDelta === null ? "First full week in view" : `${loadDelta >= 0 ? "↑" : "↓"} ${Math.abs(loadDelta)}% vs prior week`} tone="cream" />
        <MetricCard label="Watts / heartbeat" value={currentEfficiency ? currentEfficiency.toFixed(2) : "—"} unit="W/bpm" change={efficiencyDelta === null ? "Needs two power + HR rides" : `${efficiencyDelta >= 0 ? "↑" : "↓"} ${Math.abs(efficiencyDelta).toFixed(1)}% across visible rides`} tone="sky" />
        <MetricCard label="Training time" value={trainingLabel} unit="last 7 days" change={`${currentWeekRides.length} ${currentWeekRides.length === 1 ? "ride" : "rides"} completed`} tone="coral" />
      </section>

      <section className="trend-card panel span-two">
        <div className="section-heading"><div><span className="eyebrow">Watts / heartbeat</span><h2>Power-to-heart-rate trend</h2></div>{efficiencyDelta !== null && <span className="delta-positive">{efficiencyDelta >= 0 ? "+" : ""}{efficiencyDelta.toFixed(1)}%</span>}</div>
        <div className="efficiency-summary">
          <span>Selected power <strong>{selectedRide.averagePower ? `${selectedRide.averagePower} W` : "—"}</strong></span>
          <span>Selected heart rate <strong>{selectedRide.averageHeartRate ? `${selectedRide.averageHeartRate} bpm` : "—"}</strong></span>
          <span>Efficiency <strong>{selectedRide.powerHeartRateRatio ? `${selectedRide.powerHeartRateRatio.toFixed(2)} W/bpm` : "—"}</strong></span>
        </div>
        {efficiencyRides.length ? <div className="efficiency-plot">
          <div className="efficiency-axis" aria-hidden="true"><span>{efficiencyScaleMax.toFixed(1)}</span><span>{(efficiencyScaleMax / 2).toFixed(1)}</span><span>0</span></div>
          <div className="efficiency-chart" aria-label={`Power to heart-rate ratio across recent rides, scaled from zero to ${efficiencyScaleMax.toFixed(1)} watts per beat`}>
            {efficiencyRides.map((ride) => <div className="trend-column" key={ride.id}><span className="trend-value">{ride.powerHeartRateRatio.toFixed(2)}</span><div className="trend-track"><i style={{ height: `${Math.max(2, (ride.powerHeartRateRatio / efficiencyScaleMax) * 100)}%` }} /></div><small>{ride.dateLabel}</small></div>)}
          </div>
        </div> : <div className="chart-empty">Power and heart-rate data from the same ride are needed for this trend.</div>}
        <p className="chart-note"><i /> The scale starts at zero, so differences such as 0.72 to 0.85 stay proportional. Compare steady rides in similar conditions.</p>
      </section>

      <section className="load-card panel">
        <div className="section-heading"><div><span className="eyebrow">Training-load history</span><h2>Seven weeks</h2></div><span className="small-badge">{trainingLoad.status}</span></div>
        <div className="load-chart" aria-label="Weekly training load bar chart">
          {weeklyLoadValues.map((value, index) => <div key={`${value}-${index}`}><i style={{ height: `${Math.max(2, (value / loadScale) * 100)}%` }} className={index === weeklyLoadValues.length - 1 ? "current" : ""} /><small>{value}</small></div>)}
        </div>
        <div className="load-footer"><span>7-day total <strong>{sevenDayLoad}</strong></span><span>Modeled fitness <strong>{trainingLoad.current.fitnessLoad?.toFixed(1) ?? "—"}</strong></span></div>
      </section>

      <section className="power-heart-card panel full-width">
        <div className="section-heading"><div><span className="eyebrow">Watts + heart rate</span><h2>Workload and response</h2><p>Average power and average heartbeat for the same recent rides.</p></div><span className="small-badge">zero-based scales</span></div>
        {wattsHeartRides.length ? <div className="raw-series-grid">
          <article className="raw-series power-series">
            <div className="raw-series-heading"><span>Average power</span><strong>0–{wattsScaleMax} W</strong></div>
            <div className="raw-series-chart">
              {wattsHeartRides.map((ride) => <div className="raw-series-column" key={`power-${ride.id}`}><span>{ride.averagePower}</span><div><i style={{ height: `${(ride.averagePower / wattsScaleMax) * 100}%` }} /></div><small>{ride.dateLabel}</small></div>)}
            </div>
          </article>
          <article className="raw-series heart-series">
            <div className="raw-series-heading"><span>Average heart rate</span><strong>0–{heartRateScaleMax} bpm</strong></div>
            <div className="raw-series-chart">
              {wattsHeartRides.map((ride) => <div className="raw-series-column" key={`heart-${ride.id}`}><span>{ride.averageHeartRate}</span><div><i style={{ height: `${Math.min(100, (ride.averageHeartRate / heartRateScaleMax) * 100)}%` }} /></div><small>{ride.dateLabel}</small></div>)}
            </div>
          </article>
        </div> : <div className="chart-empty">Import rides containing both power and heart-rate data to build this chart.</div>}
        <p className="chart-note"><i /> Each panel has its own labeled, zero-based scale. Compare how heart rate responds as power changes; the bar heights are not the same unit.</p>
      </section>

      <section className="ride-detail panel span-two">
        <div className="section-heading"><div><span className="eyebrow">Selected ride · {selectedRide.dateLabel}</span><h2>{selectedRide.name}</h2><p>{selectedRide.route}</p></div><div className="ride-detail-actions"><span className={`environment-tag environment-${selectedRide.environment ?? (selectedRide.indoor ? "indoor" : "outdoor")}`}>{environmentLabel(selectedRide.environment, selectedRide.indoor)}</span>{workoutSubtypeLabel(selectedRide.workoutSubtype) && <span className="workout-tag">{workoutSubtypeLabel(selectedRide.workoutSubtype)}</span>}<label className="ride-type-control"><span>{rideTypeSaving ? "Saving…" : "Ride type"}</span><select value={selectedRide.type} onChange={(event) => void changeRideType(selectedRide, event.target.value as Ride["type"])} disabled={rideTypeSaving} aria-label={`Ride type for ${selectedRide.name}`}>{rideTypes.map((type) => <option key={type}>{type}</option>)}</select></label><button className="ghost-button ride-export-button" type="button" onClick={() => exportRide(selectedRide)}>Export this ride <span aria-hidden="true">↓</span></button></div></div>
        <div className="ride-stats">
          <Stat label="Distance" value={selectedRide.distanceMiles.toFixed(1)} unit="mi" />
          <Stat label="Moving time" value={formatDuration(selectedRide.movingTimeSeconds)} />
          <Stat label="Avg power" value={String(selectedRide.averagePower)} unit="W" />
          <Stat label="Avg HR" value={String(selectedRide.averageHeartRate)} unit="bpm" />
          <Stat label="Cadence" value={String(selectedRide.averageCadence)} unit="rpm" />
          <Stat label="Load" value={String(selectedRide.trainingLoad)} unit="pts" />
        </div>
        <div className="classification-panel">
          <div className="classification-heading">
            <div><span className="eyebrow">Classification evidence</span><strong>{classificationSource}</strong></div>
            <span className={`confidence-badge confidence-${selectedRide.classificationConfidence ?? "low"}`}>{selectedRide.classificationConfidence ?? "low"} confidence</span>
          </div>
          <div className="classification-controls">
            <label className="ride-type-control">
              <span>{rideTypeSaving ? "Saving..." : "Ride context"}</span>
              <select value={selectedRide.context ?? "ordinary"} onChange={(event) => void changeRideContext(selectedRide, event.target.value as RideContext)} disabled={rideTypeSaving} aria-label={`Ride context for ${selectedRide.name}`}>
                {rideContexts.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <span>{contextLabel(selectedRide.context)}</span>
          </div>
          <p>{selectedRide.classificationReason ?? "Demo classification. Saved rides include the evidence used by the current classifier."}</p>
          <small>{selectedRide.classificationVersion ?? "demo"}</small>
        </div>
        <section className={`data-quality-panel quality-${selectedQuality.level}`} aria-label={`Data quality and provenance for ${selectedRide.name}`}>
          <div className="data-quality-heading"><div><span className="eyebrow">Data quality + provenance</span><h3>{selectedQuality.label}</h3><p>{selectedQuality.sourceLabel}{selectedQuality.sourceFilename ? ` · ${selectedQuality.sourceFilename}` : ""}</p></div><span className={`confidence-badge confidence-${selectedQuality.level === "moderate" ? "moderate" : selectedQuality.level}`}>{selectedQuality.level} evidence</span></div>
          <div className="quality-summary"><span><strong>{selectedQuality.sampleCount?.toLocaleString() ?? "Summary"}</strong><small>{selectedQuality.sampleCount ? "stored samples" : "ride-level values"}</small></span><span><strong>{selectedQuality.recordedStreamCount}/6</strong><small>detailed signals</small></span><span><strong>{selectedQuality.metricsAlgorithmVersion}</strong><small>metrics version</small></span></div>
          <div className="signal-grid">{selectedQuality.signals.map((signal) => <div className={`signal-status status-${signal.status}`} key={signal.id} title={signal.detail}><span>{signal.label}</span><strong>{signal.status === "recorded_stream" ? signal.recordCount === null ? "Count unavailable" : `${signal.recordCount.toLocaleString()} records` : signal.status === "recorded_summary" ? "Ride summary" : "0 records"}</strong><small>{signal.status === "recorded_stream" ? "received samples" : signal.status === "recorded_summary" ? "no sample series" : "not received"}</small></div>)}</div>
          <div className="metric-provenance"><span>Normalized power <strong>{selectedQuality.normalizedPowerStatus.replaceAll("_", " ")}</strong></span><span>Intensity <strong>{selectedQuality.intensityStatus.replaceAll("_", " ")}</strong></span><span>Training load <strong>{selectedQuality.trainingLoadStatus.replaceAll("_", " ")}</strong></span></div>
          {selectedQuality.limitations.length > 0 && <details className="quality-limitations"><summary>{selectedQuality.limitations.length} limitations · why some analytics may be withheld</summary>{selectedQuality.limitations.map((limitation) => <p key={limitation}>{limitation}</p>)}</details>}
          <small className="quality-version">{selectedQuality.version} · no inferred sample coverage</small>
        </section>

        <div className="ride-analysis-grid">
          <div className="analysis-tile"><span>Intensity</span><strong>{selectedRide.intensityFactor.toFixed(2)} <small>IF</small></strong><p>{selectedRide.ftpAtRideWatts ? `FTP snapshot ${selectedRide.ftpAtRideWatts} W · ${ftpSnapshotLabel(selectedRide.ftpSnapshotSource)}` : "FTP at ride unavailable"}</p></div>
          <div className="analysis-tile"><span>Aerobic durability</span><strong>{selectedRide.decoupling !== null ? `${selectedRide.decoupling.toFixed(1)}%` : "Not available"} <small>{selectedRide.decouplingEligible ? `${selectedRide.decouplingConfidence ?? "low"} confidence` : selectedRide.decoupling !== null ? "observed · withheld" : ""}</small></strong><p>{selectedRide.decouplingEligible ? selectedRide.decouplingConfidence === "low" ? "Provisional estimate; use as context, not a trend." : selectedRide.decoupling! < 5 ? "Good durability" : "Moderate drift" : selectedRide.decouplingEligibilityReason ?? "Needs detailed power + heart-rate data"}</p></div>
          <div className="analysis-tile"><span>Power variability</span><strong>{selectedRide.variabilityIndex?.toFixed(2) ?? "—"} <small>VI</small></strong><p>{selectedRide.variabilityIndex && selectedRide.variabilityIndex <= 1.05 ? "Very steady pacing" : "Variable effort"}</p></div>
        </div>
        <section className="selected-cadence-panel" aria-label={`Cadence distribution for ${selectedRide.name}`}>
          <div className="selected-cadence-heading"><div><span className="eyebrow">Selected ride cadence</span><h3>Pedaling distribution</h3></div><span className="small-badge">{selectedRide.dateLabel}</span></div>
          <CadenceDistributionPanel ride={selectedRide} />
        </section>
        <section className="selected-heart-rate-panel" aria-label={`Heart-rate zones for ${selectedRide.name}`}>
          <div className="selected-cadence-heading"><div><span className="eyebrow">Selected ride heart rate</span><h3>Time in heart-rate zones</h3></div><span className="small-badge">{selectedRide.heartRateZones?.sampleCount.toLocaleString() ?? 0} samples</span></div>
          <HeartRateDistributionPanel distribution={selectedRide.heartRateZones} currentLthr={currentLthr} />
          <div className="heart-rate-context"><strong>{selectedHeartRateContext.title}</strong><span>{selectedHeartRateContext.detail}</span></div>
        </section>
        <blockquote>{selectedRide.note}</blockquote>
      </section>

      <section className="power-card panel">
        <div className="section-heading"><div><span className="eyebrow">Recorded power</span><h2>{isDemo ? "Demo curve" : "Selected ride"}</h2></div><button className="text-button" onClick={() => setView("rides")}>All rides →</button></div>
        <div className="power-bars">{selectedPowerData.map((duration) => <div key={duration.label} className="power-row"><span>{duration.label}</span><div><i style={{ width: `${(duration.watts / powerScale) * 100}%` }} /></div><strong>{duration.watts || "—"} {duration.watts ? "W" : ""}</strong><small>{isDemo ? `best ${duration.best}` : "recorded"}</small></div>)}</div>
      </section>

      <section className="recent-rides panel full-width">
        <div className="section-heading"><div><span className="eyebrow">Recent work</span><h2>Ride log</h2></div><button className="text-button" onClick={() => setView("rides")}>View all →</button></div>
        <div className="ride-list">{rides.slice(0, 4).map((ride) => <RideRow key={ride.id} ride={ride} onClick={() => openRide(ride)} onExport={() => exportRide(ride)} />)}</div>
      </section>
    </div>
  );
}

function RecoveryCheckIn({ recovery, setRecovery, recoverySaveState, saveRecovery, readiness, restingHeartRateBaseline }: {
  recovery: SubjectiveRecovery;
  setRecovery: (value: SubjectiveRecovery) => void;
  recoverySaveState: "idle" | "saving" | "saved" | "error";
  saveRecovery: () => Promise<void>;
  readiness: ReturnType<typeof calculateReadiness>;
  restingHeartRateBaseline: number | null;
}) {
  const bodyCondition = recovery.bodyCondition ?? "normal";
  const illnessSeverity = bodyCondition === "illness" ? recovery.illnessSeverity ?? 1 : 0;
  const painSeverity = bodyCondition === "pain_concern" ? recovery.painSeverity ?? 1 : 0;
  const conditions: Array<{ value: BodyCondition; label: string; detail: string }> = [
    { value: "normal", label: "Normal", detail: "No meaningful soreness" },
    { value: "mild_soreness", label: "Mild", detail: "Sore or stiff, but moving well" },
    { value: "significant_soreness", label: "Significant", detail: "Soreness may limit training" },
    { value: "illness", label: "Illness", detail: "Systemic or respiratory symptoms" },
    { value: "pain_concern", label: "Pain concern", detail: "Localized or injury-like pain" },
  ];
  const locations: Array<{ value: PainLocation; label: string }> = [
    { value: "unspecified", label: "Not specified" },
    { value: "knee", label: "Knee" },
    { value: "back", label: "Back" },
    { value: "neck_shoulders", label: "Neck / shoulders" },
    { value: "hands_wrists", label: "Hands / wrists" },
    { value: "hips", label: "Hips" },
    { value: "saddle_contact", label: "Saddle / contact point" },
    { value: "other", label: "Other" },
  ];
  return (
    <section className="checkin-card panel">
      <div className="section-heading compact"><div><span className="eyebrow">{readiness.postRideAdjusted ? "Post-ride readiness" : "Recovery check-in"}</span><h2>How are you feeling?</h2><small>{readiness.confidence} confidence{readiness.estimated ? " · estimated inputs remain" : " · complete current evidence"}</small></div><span className={`readiness-score tone-${readiness.tone}`}>{readiness.score}</span></div>
      <span className="checkin-label">Leg freshness</span>
      <div className="segmented-control" role="group" aria-label="Leg freshness">
        {(["fresh", "normal", "heavy", "dead"] as const).map((value) => <button key={value} className={recovery.legFreshness === value ? "selected" : ""} onClick={() => setRecovery({ ...recovery, legFreshness: value })}>{value}</button>)}
      </div>
      <div className="range-row"><span><strong>Sleep</strong><small>{recovery.sleepQuality}/5</small></span><input aria-label="Sleep quality" type="range" min="1" max="5" value={recovery.sleepQuality} onChange={(event) => setRecovery({ ...recovery, sleepQuality: Number(event.target.value) })} /></div>
      <div className="range-row"><span><strong>Motivation</strong><small>{recovery.motivation}/5</small></span><input aria-label="Motivation" type="range" min="1" max="5" value={recovery.motivation} onChange={(event) => setRecovery({ ...recovery, motivation: Number(event.target.value) })} /></div>
      <label className="resting-heart-rate-input"><span><strong>Resting heart rate <small>(optional)</small></strong><small>{restingHeartRateBaseline === null ? "Baseline needs 3 prior readings" : `Recent baseline ${restingHeartRateBaseline} bpm`}</small></span><span><input aria-label="Resting heart rate" type="number" min="30" max="120" placeholder="bpm" value={recovery.restingHeartRate ?? ""} onChange={(event) => setRecovery({ ...recovery, restingHeartRate: event.target.value ? Number(event.target.value) : null })} /><em>bpm</em></span></label>
      <fieldset className="body-condition-fieldset">
        <legend>Body condition today</legend>
        <div className="body-condition-control">
          {conditions.map((condition) => (
            <button
              key={condition.value}
              type="button"
              className={bodyCondition === condition.value ? "selected" : ""}
              aria-pressed={bodyCondition === condition.value}
              onClick={() => setRecovery({
                ...recovery,
                bodyCondition: condition.value,
                painLocation: condition.value === "pain_concern" ? recovery.painLocation ?? "unspecified" : "unspecified",
                painSeverity: condition.value === "pain_concern" ? Math.max(1, recovery.painSeverity ?? 0) : 0,
                illnessSeverity: condition.value === "illness" ? Math.max(1, recovery.illnessSeverity ?? 0) : 0,
              })}
            >
              <strong>{condition.label}</strong>
              <small>{condition.detail}</small>
            </button>
          ))}
        </div>
      </fieldset>
      {bodyCondition === "pain_concern" && (
        <div className="pain-details">
          <label>
            <span>Where is the concern?</span>
            <select aria-label="Pain or injury concern location" value={recovery.painLocation ?? "unspecified"} onChange={(event) => setRecovery({ ...recovery, painLocation: event.target.value as PainLocation })}>
              {locations.map((location) => <option key={location.value} value={location.value}>{location.label}</option>)}
            </select>
          </label>
          <div className="range-row compact"><span><strong>Severity</strong><small>{painSeverity}/10</small></span><input aria-label="Pain or injury concern severity" type="range" min="1" max="10" value={painSeverity} onChange={(event) => setRecovery({ ...recovery, painSeverity: Number(event.target.value) })} /></div>
          <p className={`pain-guidance ${painSeverity >= 7 ? "urgent" : ""}`}>{painSeverity >= 7 ? "Do not train through severe, sharp, or worsening pain. Consider appropriate medical guidance." : painSeverity >= 5 ? "The plan will recommend rest and pain-free movement only." : painSeverity >= 3 ? "The plan will remove intensity and keep any riding easy and pain-free." : "A mild concern is noted without automatically stopping training."}</p>
        </div>
      )}
      {bodyCondition === "illness" && (
        <div className="pain-details illness-details"><div className="range-row compact"><span><strong>Symptom severity</strong><small>{illnessSeverity}/10</small></span><input aria-label="Illness symptom severity" type="range" min="1" max="10" value={illnessSeverity} onChange={(event) => setRecovery({ ...recovery, illnessSeverity: Number(event.target.value) })} /></div><p className={`pain-guidance ${illnessSeverity >= 4 ? "urgent" : ""}`}>{illnessSeverity >= 4 ? "Training guidance will be withheld. Rest and use appropriate medical guidance for concerning symptoms." : "Intensity will be removed. Reassess symptoms before any easy movement."}</p></div>
      )}
      {readiness.adjustments.map((reason) => <div className="post-ride-adjustment" key={reason}><strong>Readiness adjustment</strong><span>{reason}</span></div>)}
      <div className="readiness-summary"><div><strong>{readiness.label}</strong><span>{recoverySaveState === "saved" ? "Private check-in saved" : recoverySaveState === "error" ? "Save failed · try again" : "0–100 · updates with current time and check-in"}</span></div><button className="text-button" onClick={() => void saveRecovery()} disabled={recoverySaveState === "saving"}>{recoverySaveState === "saving" ? "Saving…" : "Save check-in"}</button></div>
      <details className="readiness-evidence"><summary>Why {readiness.score}? · {readiness.confidence} confidence</summary><div className="readiness-component-list">{readiness.components.map((component) => <p key={component.label}><span><strong>{component.label}</strong><small>{component.detail}</small></span><em>{component.contribution >= 0 ? "+" : ""}{component.contribution.toFixed(1)}</em></p>)}</div>{readiness.assumptions.length > 0 && <div className="readiness-assumptions"><strong>Current assumptions</strong>{readiness.assumptions.map((assumption) => <p key={assumption}>{assumption}</p>)}</div>}</details>
    </section>
  );
}

function MetricCard({ label, value, unit, change, tone }: { label: string; value: string; unit: string; change: string; tone: string }) {
  return <article className={`metric-card tone-${tone}`}><span>{label}</span><div><strong>{value}</strong><small>{unit}</small></div><p>{change}</p></article>;
}

function Stat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return <div className="stat"><span>{label}</span><strong>{value} {unit && <small>{unit}</small>}</strong></div>;
}

function RideRow({ ride, onClick, onExport }: { ride: Ride; onClick: () => void; onExport: () => void }) {
  return <div className="ride-row-shell"><button className="ride-row" type="button" onClick={onClick}><span className="ride-date"><strong>{ride.dayLabel}</strong><small>{ride.dateLabel}</small></span><span className="ride-main"><strong>{ride.name}</strong><small>{ride.route} · {environmentLabel(ride.environment, ride.indoor)}</small></span><span className={`ride-tag ${ride.type.toLowerCase().replaceAll(" ", "-")}`}>{ride.type}</span><span className="ride-number"><strong>{ride.distanceMiles.toFixed(1)}</strong><small>mi</small></span><span className="ride-number"><strong>{ride.averagePower}</strong><small>W avg</small></span><span className="ride-number"><strong>{ride.trainingLoad}</strong><small>load</small></span><span className="row-arrow">→</span></button><button className="ride-row-export" type="button" onClick={onExport} aria-label={`Export ${ride.name} as Markdown`} title="Export this ride as Markdown"><span>.md</span><strong aria-hidden="true">↓</strong></button></div>;
}

function RideLog({ rides, allRides, filter, setFilter, search, setSearch, openRide, exportRide, reclassifyAutomaticRides, isReclassifying }: { rides: Ride[]; allRides: Ride[]; filter: string; setFilter: (value: string) => void; search: string; setSearch: (value: string) => void; openRide: (ride: Ride) => void; exportRide: (ride: Ride) => void; reclassifyAutomaticRides: () => Promise<void>; isReclassifying: boolean }) {
  const distance = allRides.reduce((sum, ride) => sum + ride.distanceMiles, 0);
  const movingSeconds = allRides.reduce((sum, ride) => sum + ride.movingTimeSeconds, 0);
  const elevation = allRides.reduce((sum, ride) => sum + ride.elevationFeet, 0);
  const timeLabel = movingSeconds >= 3600 ? `${Math.round(movingSeconds / 3600)}h` : `${Math.round(movingSeconds / 60)}m`;

  return (
    <div className="page-stack">
      <section className="log-summary panel-dark">
        <div><span className="eyebrow light">All recorded rides</span><strong>{distance.toLocaleString(undefined, { maximumFractionDigits: 1 })}</strong><small>miles in this log</small></div>
        <div><strong>{allRides.length}</strong><small>rides</small></div>
        <div><strong>{timeLabel}</strong><small>moving time</small></div>
        <div><strong>{elevation.toLocaleString()}</strong><small>feet climbed</small></div>
      </section>
      <section className="panel ride-log-panel">
        <div className="classification-toolbar">
          <div><strong>Trustworthy classification</strong><span>Re-run the current rules on automatic labels. Manual corrections are never overwritten.</span></div>
          <button className="ghost-button" type="button" onClick={() => void reclassifyAutomaticRides()} disabled={isReclassifying}>{isReclassifying ? "Classifying..." : "Reclassify automatic rides"}</button>
        </div>
        <div className="filter-bar">
          <label className="search-box"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search rides or routes" /></label>
          <div className="filter-buttons" role="group" aria-label="Filter ride type">{["All rides", ...rideTypes].map((value) => <button key={value} className={filter === value ? "selected" : ""} onClick={() => setFilter(value)}>{value}</button>)}</div>
        </div>
        <div className="table-header"><span>Date</span><span>Ride</span><span>Type</span><span>Distance</span><span>Power</span><span>Load</span><span /><span>Export</span></div>
        <div className="ride-list full-list">{rides.map((ride) => <RideRow key={ride.id} ride={ride} onClick={() => openRide(ride)} onExport={() => exportRide(ride)} />)}{!rides.length && <div className="empty-state"><strong>No rides match this view.</strong><span>Try a different ride type or search term.</span></div>}</div>
      </section>
    </div>
  );
}

function PerformanceDetails({ rides, currentFtp, currentLthr, nowMs }: { rides: Ride[]; currentFtp: number; currentLthr: number | null; nowMs: number }) {
  const dayMs = 24 * 60 * 60 * 1000;
  const anchorMs = nowMs;
  const withinDays = (days: number) => rides.filter((ride) => {
    const timestamp = Date.parse(rideStartedAt(ride));
    return Number.isFinite(timestamp) && timestamp > anchorMs - (days * dayMs) && timestamp <= anchorMs;
  });
  const acuteRides = withinDays(7);
  const weeklyHeartRate = currentLthr === null ? null : aggregateHeartRateZones(acuteRides.map((ride) => ride.heartRateZones?.thresholdBpm === currentLthr ? ride.heartRateZones : null));
  const weeklyHeartRateRideCount = acuteRides.filter((ride) => ride.heartRateZones?.thresholdBpm === currentLthr).length;
  const trainingLoad = buildTrainingLoadModel(
    rides.map((ride) => ({ date: rideStartedAt(ride), trainingLoad: ride.trainingLoad })),
    new Date(anchorMs),
  );
  const load7 = trainingLoad.current.sevenDayLoad;
  const loadRatio = trainingLoad.current.loadRatio;
  const routeComparison = buildComparableRouteCohorts(rides.map((ride) => ({
    ...ride,
    environment: ride.environment ?? (ride.indoor ? "indoor" : "outdoor"),
    trainingType: ride.type,
    context: ride.context ?? "ordinary",
  })));
  const groupedRoutes = routeComparison.cohorts;
  const benchmarkCandidates = rides.filter((ride) => ride.context === "benchmark");
  const benchmarkCohort = buildZone2BenchmarkCohort(benchmarkCandidates.map((ride) => ({
    ...ride,
    trainingType: ride.type,
    context: ride.context ?? "ordinary",
    environment: ride.environment ?? (ride.indoor ? "indoor" : "outdoor"),
    decouplingEligible: ride.decouplingEligible ?? false,
    decouplingConfidence: ride.decouplingConfidence === "none" ? undefined : ride.decouplingConfidence,
    stoppedPercent: ride.stoppedPercent ?? null,
  })));
  const benchmarkRides = benchmarkCohort.rides;
  const latestBenchmark = benchmarkRides[0];
  const previousBenchmark = benchmarkCohort.trendReady ? benchmarkRides[1] : undefined;
  const benchmarkCandidateById = new Map(benchmarkCandidates.map((ride) => [ride.id, ride]));
  const rideById = new Map(rides.map((ride) => [ride.id, ride]));
  const cadenceOverview = buildCadenceOverview(rides.map(cadenceAnalyticsRide));
  const cadenceRideById = new Map(rides.map((ride) => [ride.id, ride]));
  const cadenceTrendScale = Math.max(100, Math.ceil(Math.max(0, ...cadenceOverview.recent.map((ride) => ride.averageCadence)) / 10) * 10);

  const volumeHours = acuteRides.reduce((sum, ride) => sum + ride.movingTimeSeconds, 0) / 3600;
  const volumeDistance = acuteRides.reduce((sum, ride) => sum + ride.distanceMiles, 0);
  const volumeElevation = acuteRides.reduce((sum, ride) => sum + ride.elevationFeet, 0);
  const loadStatus = describeTrainingLoad(trainingLoad);
  const loadTrendPoints = trainingLoad.points.slice(-42);
  const loadTrendMaximum = Math.max(1, ...loadTrendPoints.flatMap((point) => [point.fitnessLoad, point.fatigueLoad]));
  const loadLine = (value: (point: (typeof loadTrendPoints)[number]) => number) => loadTrendPoints
    .map((point, index) => {
      const x = loadTrendPoints.length <= 1 ? 0 : (index / (loadTrendPoints.length - 1)) * 100;
      const y = 38 - ((value(point) / loadTrendMaximum) * 34);
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
  const latestDriftRide = rides
    .filter((ride) => ride.decoupling !== null)
    .sort((a, b) => Date.parse(b.startedAt ?? b.date) - Date.parse(a.startedAt ?? a.date))[0];
  const driftLabel = !latestDriftRide
    ? "No recorded estimate"
    : !latestDriftRide.decouplingEligible ? "Not suitable for interpretation" : latestDriftRide.decouplingConfidence === "low" ? "Provisional estimate" : latestDriftRide.decoupling! < 3 ? "Excellent durability" : latestDriftRide.decoupling! <= 5 ? "Good durability" : latestDriftRide.decoupling! <= 8 ? "Moderate drift" : "Significant drift";
  const percentChange = (current: number, previous: number, invert = false) => {
    if (!previous) return "—";
    const delta = ((current - previous) / previous) * 100 * (invert ? -1 : 1);
    return `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}%`;
  };

  return (
    <div className="phase-two-layout">
      <section className="phase-two-hero panel-dark">
        <div><span className="eyebrow light">Performance details</span><h2>Compare like with like.</h2></div>
        <p>Comparisons require the same route, environment, context, similar distance, and complete power/heart-rate evidence. A different training stimulus lowers confidence and keeps the result descriptive.</p>
      </section>

      <section className="phase-kpis">
        <MetricCard label="7-day load" value={Math.round(load7).toString()} unit="recent total" change={`${acuteRides.length} recent rides`} tone="lime" />
        <MetricCard label="42-day fitness" value={trainingLoad.current.fitnessLoad?.toFixed(1) ?? "—"} unit="modeled load" change={trainingLoad.status === "established" ? `${trainingLoad.historyDays} days of history` : trainingLoad.limitations[0] ?? "History needed"} tone="cream" />
        <MetricCard label="7-day fatigue" value={trainingLoad.current.fatigueLoad?.toFixed(1) ?? "—"} unit="modeled load" change={loadStatus} tone="coral" />
        <MetricCard label="Benchmarks" value={benchmarkRides.length.toString()} unit="eligible rides" change={benchmarkCohort.trendReady ? `Trend ready · ${groupedRoutes.length} route cohorts` : `${benchmarkRides.length} of ${ZONE2_BENCHMARK_PROTOCOL.minimumTrendRides} needed · ${groupedRoutes.length} route cohorts`} tone="sky" />
      </section>

      <section className="route-benchmarks panel">
        <div className="section-heading"><div><span className="eyebrow">Same-route comparison</span><h2>Like for like</h2></div><span className="small-badge">{groupedRoutes.length} cohorts · {routeComparison.excluded.length} excluded</span></div>
        {groupedRoutes.length ? <div className="route-comparison-list">{groupedRoutes.slice(0, 3).map((cohort) => {
          const sorted = [...cohort.rides].sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
          const first = sorted[0];
          const latest = sorted.at(-1)!;
          return <article className="route-comparison" key={cohort.key}>
            <div className="comparison-heading"><div><strong>{first.route}</strong><span>{environmentLabel(first.environment, first.indoor)} · {first.type} · {contextLabel(first.context)} · {first.dateLabel} → {latest.dateLabel} · {cohort.rides.length} efforts</span></div><span className={`confidence-badge confidence-${cohort.confidence}`}>{cohort.confidence} confidence</span></div>
            <dl><div><dt>Time</dt><dd>{percentChange(latest.movingTimeSeconds, first.movingTimeSeconds, true)}</dd></div><div><dt>Power</dt><dd>{percentChange(latest.averagePower, first.averagePower)}</dd></div><div><dt>Heart rate</dt><dd>{percentChange(latest.averageHeartRate, first.averageHeartRate, true)}</dd></div><div><dt>W / bpm</dt><dd>{percentChange(latest.powerHeartRateRatio, first.powerHeartRateRatio)}</dd></div></dl>
            <p className="comparison-reason">{cohort.reasons.join(" ")}</p>
          </article>;
        })}</div> : <div className="analysis-empty"><strong>No genuinely comparable route cohort yet.</strong><span>{routeComparison.excluded.length ? `${routeComparison.excluded.length} rides were withheld because route, environment, context, distance, or power/HR evidence did not match.` : "Import repeat efforts with the same route, environment, and complete power/HR data."}</span></div>}
        <p className="chart-note"><i /> Route cohorts require distance within 8%. Different training stimuli remain visible but are descriptive only and capped at moderate confidence. Race, group-ride, and structured-workout contexts are excluded; outdoor conditions also cap confidence at moderate. {COMPARABILITY_VERSION}</p>
        {routeComparison.excluded.length > 0 && <details className="benchmark-exclusions route-exclusions"><summary>{routeComparison.excluded.length} route ride{routeComparison.excluded.length === 1 ? "" : "s"} excluded · show reasons</summary><div>{routeComparison.excluded.slice(0, 5).map((entry) => <p key={entry.rideId}><strong>{rideById.get(entry.rideId)?.name ?? "Ride"}</strong><span>{entry.reason}</span></p>)}</div></details>}
      </section>

      <section className="benchmark-card panel">
        <div className="section-heading"><div><span className="eyebrow">Controlled Zone 2 benchmark</span><h2>{Math.round(currentFtp * 2 / 3)} W · 60 minutes</h2></div><span className={`confidence-badge confidence-${benchmarkCohort.confidence}`}>{benchmarkCohort.confidence} confidence</span></div>
        <div className="benchmark-protocol" aria-label="Controlled Zone 2 benchmark protocol"><span>50–70 min</span><span>IF 0.60–0.75</span><span>VI ≤ 1.05</span><span>Stops ≤ 2%</span><span>80–95 rpm</span><span>Paired power + HR</span></div>
        {latestBenchmark ? <>
          <div className="benchmark-score"><div><span>Latest eligible efficiency</span><strong>{latestBenchmark.powerHeartRateRatio ? latestBenchmark.powerHeartRateRatio.toFixed(3) : "—"}</strong><small>W / bpm · {latestBenchmark.dateLabel}</small></div>{previousBenchmark ? <div><span>vs previous comparable</span><strong>{percentChange(latestBenchmark.powerHeartRateRatio, previousBenchmark.powerHeartRateRatio)}</strong><small>{previousBenchmark.dateLabel} · trend threshold met</small></div> : <div><span>Trend status</span><strong>{benchmarkRides.length}/{ZONE2_BENCHMARK_PROTOCOL.minimumTrendRides}</strong><small>No trend claim yet</small></div>}</div>
          <div className="benchmark-evidence"><strong>{benchmarkCohort.trendReady ? "Comparable trend established" : "Eligible observation; trend withheld"}</strong><span>{benchmarkCohort.reasons.join(" ")}</span><small>{ZONE2_BENCHMARK_VERSION}</small></div>
          <div className="benchmark-details"><Stat label="Average HR" value={latestBenchmark.averageHeartRate ? String(latestBenchmark.averageHeartRate) : "—"} unit="bpm" /><Stat label="First 15 min" value={latestBenchmark.first15HeartRate ? latestBenchmark.first15HeartRate.toFixed(0) : "—"} unit="bpm" /><Stat label="Final 15 min" value={latestBenchmark.final15HeartRate ? latestBenchmark.final15HeartRate.toFixed(0) : "—"} unit="bpm" /><Stat label="Cadence σ" value={latestBenchmark.cadenceStddev ? latestBenchmark.cadenceStddev.toFixed(1) : "—"} unit="rpm" /></div>
        </> : <div className="analysis-empty"><strong>{benchmarkCandidates.length ? "Benchmark candidates did not pass the protocol." : "No benchmark ride classified yet."}</strong><span>{benchmarkCohort.excluded[0]?.reason ?? "Choose Zone 2 as the ride type and Controlled benchmark as its context."}</span></div>}
        {benchmarkCohort.excluded.length > 0 && <details className="benchmark-exclusions"><summary>{benchmarkCohort.excluded.length} candidate{benchmarkCohort.excluded.length === 1 ? "" : "s"} excluded · show reasons</summary><div>{benchmarkCohort.excluded.slice(0, 5).map((entry) => <p key={entry.rideId}><strong>{benchmarkCandidateById.get(entry.rideId)?.name ?? "Benchmark ride"}</strong><span>{entry.reason}</span></p>)}</div></details>}
      </section>

      <section className="durability-card panel">
        <div className="section-heading"><div><span className="eyebrow">Cardiac drift</span><h2>Aerobic durability</h2></div><span className={`small-badge${latestDriftRide?.decouplingEligible ? ` confidence-${latestDriftRide.decouplingConfidence ?? "low"}` : ""}`}>{latestDriftRide ? latestDriftRide.decouplingEligible ? `${latestDriftRide.decouplingConfidence ?? "low"} confidence` : "observed · withheld" : "steady rides only"}</span></div>
        <div className="drift-result"><strong>{latestDriftRide ? `${latestDriftRide.decoupling!.toFixed(1)}%` : "—"}</strong><span>{driftLabel}</span></div>
        <p>{latestDriftRide ? `${latestDriftRide.name} · ${latestDriftRide.dateLabel}. ${latestDriftRide.decouplingEligibilityReason ?? "Calculated from central power / heart-rate intervals after excluding warm-up and cooldown buckets."}` : `Requires at least ${DECOUPLING_PROTOCOL.minimumDurationSeconds / 60} minutes, VI ≤ ${DECOUPLING_PROTOCOL.maximumVariabilityIndex.toFixed(2)}, no more than ${DECOUPLING_PROTOCOL.maximumStoppedPercent}% stopped time, a steady non-workout effort, and sufficient paired power/HR data. Rides under ${DECOUPLING_PROTOCOL.moderateDurationSeconds / 60} minutes are provisional.`}</p>
      </section>

      <section className="cadence-card panel full-width">
        <div className="section-heading"><div><span className="eyebrow">Cadence across every ride</span><h2>Pedaling patterns</h2><p>Recent average cadence plus ride-level medians separated by environment and training type.</p></div><span className="small-badge">{cadenceOverview.available.length}/{rides.length} rides with streams</span></div>
        {cadenceOverview.available.length ? <>
          <div className="cadence-performance-grid">
            <article className="cadence-trend-panel">
              <div className="cadence-subheading"><span>Recent rides</span><strong>Average cadence</strong><small>0-{cadenceTrendScale} rpm scale</small></div>
              <div className="cadence-trend" aria-label={`Average cadence for the ${cadenceOverview.recent.length} most recent rides with cadence streams`}>
                {cadenceOverview.recent.map((entry) => {
                  const sourceRide = cadenceRideById.get(entry.id);
                  return <div className={`cadence-trend-column environment-${entry.environment}`} key={entry.id} title={`${sourceRide?.name ?? "Ride"}: ${entry.averageCadence.toFixed(0)} rpm; ${environmentLabel(entry.environment)}; ${entry.trainingType}`}><span>{entry.averageCadence.toFixed(0)}</span><div><i style={{ height: `${Math.max(4, (entry.averageCadence / cadenceTrendScale) * 100)}%` }} /></div><small>{sourceRide?.dateLabel ?? entry.date}</small></div>;
                })}
              </div>
              <div className="cadence-legend"><span className="environment-virtual">Virtual</span><span className="environment-indoor">Indoor</span><span className="environment-outdoor">Outdoor</span></div>
            </article>
            <article className="cadence-cohort-panel">
              <div className="cadence-subheading"><span>Comparable context</span><strong>By environment</strong><small>Median of ride-level results</small></div>
              <div className="cadence-cohort-grid">{cadenceOverview.environments.map((summary) => <CadenceCohortCard summary={summary} key={summary.key} />)}</div>
            </article>
          </div>
          <div className="cadence-type-section">
            <div className="cadence-subheading"><span>Training context</span><strong>By training type</strong><small>Largest cohorts first</small></div>
            <div className="cadence-cohort-grid training-types">{cadenceOverview.trainingTypes.slice(0, 6).map((summary) => <CadenceCohortCard summary={summary} key={summary.key} />)}</div>
          </div>
          <p className="chart-note"><i /> All rides with per-sample cadence are included. Cohort values are ride-level medians, not sample-weighted averages or same-route performance claims. Zero-rpm coasting is excluded.</p>
        </> : <div className="analysis-empty"><strong>No ride has a cadence stream yet.</strong><span>Strava detailed streams, FIT, or TCX can provide cadence when the recording device captured it.</span></div>}
      </section>

      <section className="heart-rate-week-card panel full-width">
        <div className="section-heading"><div><span className="eyebrow">Heart rate · last 7 days</span><h2>Weekly time in zones</h2><p>Recorded samples are combined only when they use your current LTHR.</p></div><span className="small-badge">{weeklyHeartRateRideCount} {weeklyHeartRateRideCount === 1 ? "ride" : "rides"}</span></div>
        <HeartRateDistributionPanel distribution={weeklyHeartRate} currentLthr={currentLthr} />
        <p className="chart-note"><i /> This is sample-weighted training distribution, not a target or a score. Run a six-month Strava sync or re-import files after changing LTHR so older rides use the same boundaries.</p>
      </section>

      <section className="workload-card panel full-width">
        <div className="section-heading"><div><span className="eyebrow">Training load</span><h2>Fitness and fatigue with context</h2></div><span className={`load-flag ${loadRatio !== null && loadRatio > 1.3 ? "alert" : ""}`}>{loadStatus}</span></div>
        <div className="workload-equation" aria-label="Modeled seven-day fatigue divided by modeled 42-day fitness"><article><span>7-day fatigue</span><strong>{trainingLoad.current.fatigueLoad?.toFixed(1) ?? "—"}</strong><small>exponentially weighted</small></article><b>÷</b><article><span>42-day fitness</span><strong>{trainingLoad.current.fitnessLoad?.toFixed(1) ?? "—"}</strong><small>exponentially weighted</small></article><b>=</b><article className="workload-result"><span>Current comparison</span><strong>{loadRatio === null ? "—" : `${loadRatio.toFixed(2)}×`}</strong><small>{loadStatus}</small></article></div>
        {loadTrendPoints.length > 1 ? <div className="training-load-series">
          <div className="training-load-series-heading"><span>Last {loadTrendPoints.length} days</span><strong>Modeled daily trend</strong><small>0–{Math.ceil(loadTrendMaximum)} load</small></div>
          <svg viewBox="0 0 100 40" preserveAspectRatio="none" role="img" aria-label="Modeled 42-day fitness and 7-day fatigue trend">
            <title>Modeled 42-day fitness and 7-day fatigue</title>
            <line x1="0" y1="38" x2="100" y2="38" />
            <line x1="0" y1="21" x2="100" y2="21" />
            <polyline className="fitness-line" points={loadLine((point) => point.fitnessLoad)} />
            <polyline className="fatigue-line" points={loadLine((point) => point.fatigueLoad)} />
          </svg>
          <div className="training-load-legend"><span className="fitness">42-day fitness</span><span className="fatigue">7-day fatigue</span><em>{trainingLoad.status} evidence</em></div>
        </div> : <div className="analysis-empty compact"><strong>Training-load trend needs more history.</strong><span>{trainingLoad.limitations[0] ?? "Import rides with recorded training load."}</span></div>}
        <div className="workload-grid"><Stat label="Hours" value={volumeHours.toFixed(1)} /><Stat label="Distance" value={volumeDistance.toFixed(1)} unit="mi" /><Stat label="Elevation" value={Math.round(volumeElevation).toLocaleString()} unit="ft" /><Stat label="7-day load" value={Math.round(load7).toString()} unit="pts" /><Stat label="Hard sessions" value={acuteRides.filter((ride) => ride.type === "Tempo" || ride.type === "Threshold").length.toString()} /></div>
        <p className="chart-note"><i /> Daily training load feeds two exponential estimates: 42-day fitness and 7-day fatigue. A ratio appears only after enough history. These are workload models, not direct physiological measurements or injury predictions. {trainingLoad.algorithmVersion}</p>
      </section>
    </div>
  );
}

function CadenceDistributionPanel({ ride }: { ride: Ride }) {
  const available = hasCadenceDistribution(cadenceAnalyticsRide(ride));
  if (!available) {
    return <div className="analysis-empty compact"><strong>Cadence stream unavailable for this ride.</strong><span>Strava detailed streams, FIT, or TCX can provide per-sample cadence when the recording device captured it.</span></div>;
  }

  return <div className="ride-cadence-content">
    <div className="cadence-ride-summary">
      <div><span>Average</span><strong>{ride.averageCadence} <small>rpm</small></strong></div>
      <div><span>Maximum</span><strong>{ride.maximumCadence || "-"} <small>{ride.maximumCadence ? "rpm" : ""}</small></strong></div>
      <div><span>Variability</span><strong>{ride.cadenceStddev?.toFixed(1) ?? "-"} <small>{ride.cadenceStddev !== null && ride.cadenceStddev !== undefined ? "rpm sigma" : ""}</small></strong></div>
    </div>
    <div className="distribution-list">
      <DistributionRow label="Target 85-90 rpm" value={ride.cadenceTargetPercent ?? 0} tone="target" />
      <DistributionRow label="Endurance 80-95 rpm" value={ride.cadenceAcceptablePercent ?? 0} tone="acceptable" />
      <DistributionRow label="Grinding below 75 rpm" value={ride.cadenceLowPercent ?? 0} tone="low" />
      <DistributionRow label="High above 100 rpm" value={ride.cadenceHighPercent ?? 0} tone="high" />
    </div>
    <p className="cadence-sample-note">Positive cadence samples only; zero-rpm coasting is excluded. Bands overlap and are not intended to total 100%.</p>
  </div>;
}

function HeartRateDistributionPanel({ distribution, currentLthr }: { distribution: HeartRateZoneDistribution | null | undefined; currentLthr: number | null }) {
  if (currentLthr === null) {
    return <div className="analysis-empty compact"><strong>Add an LTHR to unlock heart-rate zones.</strong><span>Use a tested or carefully observed threshold heart rate. The app will not estimate one from maximum heart rate.</span></div>;
  }
  if (!distribution) {
    return <div className="analysis-empty compact"><strong>No zone distribution stored yet.</strong><span>Run a six-month Strava sync or re-import the original FIT/TCX file to analyze recorded heart-rate samples with your {currentLthr} bpm LTHR.</span></div>;
  }
  return <div className="heart-rate-distribution">
    <div className="heart-rate-zone-list">
      {HEART_RATE_ZONES.map((zone, index) => <DistributionRow
        key={zone.key}
        label={`${zone.shortLabel} ${zone.label} · ${heartRateZoneRange(distribution.thresholdBpm, index)}`}
        value={distribution[zone.key]}
        tone={`heart-zone-${index + 1}`}
      />)}
    </div>
    <p className="cadence-sample-note">{distribution.sampleCount.toLocaleString()} recorded heart-rate samples · calculated from {distribution.thresholdBpm} bpm LTHR{distribution.thresholdBpm === currentLthr ? "" : ` · current LTHR is ${currentLthr} bpm; reprocess this ride for matching zones`}.</p>
  </div>;
}
function CadenceCohortCard({ summary }: { summary: CadenceCohortSummary }) {
  return <article className="cadence-cohort-card"><span>{summary.label}</span><strong>{summary.medianAverageCadence.toFixed(0)} <small>rpm</small></strong><p>{summary.medianAcceptablePercent.toFixed(0)}% median in 80-95 rpm</p><small>{summary.rideCount} {summary.rideCount === 1 ? "ride" : "rides"}{summary.medianCadenceStddev === null ? "" : ` - ${summary.medianCadenceStddev.toFixed(1)} rpm median sigma`}</small></article>;
}

function DistributionRow({ label, value, tone }: { label: string; value: number; tone: string }) {
  return <div className="distribution-row"><span>{label}</span><div><i className={tone} style={{ width: `${Math.max(1, Math.min(100, value))}%` }} /></div><strong>{value.toFixed(0)}%</strong></div>;
}

type PowerRecordEffortView = {
  rideId: string;
  rideName: string;
  startedAt: string;
  bestPowerWatts: number;
};

type PowerRecordHistoryView = {
  algorithmVersion: string;
  records: Array<{
    durationSeconds: number;
    label: string;
    allTime: PowerRecordEffortView;
    previousRecord: PowerRecordEffortView | null;
    best30Days: PowerRecordEffortView | null;
    best42Days: PowerRecordEffortView | null;
    best90Days: PowerRecordEffortView | null;
    improvementWatts: number | null;
    improvementPercent: number | null;
    effortCount: number;
    recordCount: number;
  }>;
  timeline: Array<{
    durationSeconds: number;
    label: string;
    effort: PowerRecordEffortView;
    previousPowerWatts: number | null;
    improvementWatts: number | null;
    improvementPercent: number | null;
  }>;
};

type PhaseThreeInsights = {
  currentFtpWatts: number | null;
  weightKg: number | null;
  lthrBpm: number | null;
  lthrProfile: {
    bpm: number;
    source: string;
    confidence: "low" | "moderate" | "high" | null;
    sourceRideId: string | null;
    sourceRideName: string | null;
    effectiveAt: string | null;
  } | null;
  lthrCandidates: Array<{
    rideId: string; rideName: string; startedAt: string; lthrBpm: number;
    confidence: "moderate" | "high"; algorithmVersion: string;
    windowStartSeconds: number; windowEndSeconds: number; sampleCount: number;
    coveragePercent: number; averagePowerWatts: number; powerPercentFtp: number;
    powerVariationPercent: number; zeroPowerPercent: number; averageHeartRateBpm: number;
    minimumHeartRateBpm: number; maximumHeartRateBpm: number; heartRateChangeBpm: number;
    evidence: string[]; limitations: string[];
  }>;
  lthrHistory: Array<{ effectiveAt: string; lthrBpm: number; source: string; sourceRideId: string | null; confidence: "low" | "moderate" | "high"; algorithmVersion: string | null }>;
  profileComplete: boolean;
  ftpHistory: Array<{ effectiveAt: string; ftpWatts: number; source: string }>;
  prediction: { minimumWatts: number | null; maximumWatts: number | null; midpointWatts: number | null; confidence: string; signals: string[] };
  vo2Estimate: {
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
  powerRecords: PowerRecordHistoryView;
  goal: { id: string; targetFtpWatts: number; createdAt: string } | null;
  integrations: {
    strava: { configured: boolean; connected: boolean; displayName: string | null; lastSyncedAt: string | null };
    garmin: { status: string; detail: string };
  };
};

type StravaSettings = {
  configured: boolean;
  clientId: string | null;
  storage: "owner-only-file" | "operating-system-encrypted";
};

function PowerRecordsCard({ history }: { history: PowerRecordHistoryView | null | undefined }) {
  const preferredDurations = new Set([5, 60, 300, 1200, 3600, 5400]);
  const featured = (history?.records ?? []).filter((record) => preferredDurations.has(record.durationSeconds));
  const recordTimeline = (history?.timeline ?? []).filter((event) => event.previousPowerWatts !== null);
  const visibleTimeline = (recordTimeline.length ? recordTimeline : history?.timeline ?? []).slice(0, 8);
  const dateLabel = (startedAt: string) => new Date(startedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return (
    <section className="power-records-card panel full-width">
      <div className="section-heading"><div><span className="eyebrow">Personal records</span><h2>Power-duration history</h2><p>All-time records alongside your best continuous efforts from the last 42 and 90 days.</p></div><span className="small-badge">gap-aware / {history?.algorithmVersion ?? "power-duration-v3"}</span></div>
      {featured.length ? <>
        <div className="power-record-grid">
          {featured.map((record) => <article key={record.durationSeconds}>
            <span className="power-record-duration">{record.label}</span>
            <strong>{Math.round(record.allTime.bestPowerWatts)} <small>W</small></strong>
            <p>{record.allTime.rideName}</p>
            <time dateTime={record.allTime.startedAt}>{dateLabel(record.allTime.startedAt)}</time>
            <div className="power-record-change">
              <span>{record.improvementWatts === null ? "First baseline" : `+${record.improvementWatts.toFixed(1)} W / +${record.improvementPercent?.toFixed(1)}%`}</span>
              <small>{record.recordCount} record {record.recordCount === 1 ? "mark" : "changes"}</small>
            </div>
            <dl>
              <div><dt>42-day best</dt><dd>{record.best42Days ? `${Math.round(record.best42Days.bestPowerWatts)} W` : "--"}</dd></div>
              <div><dt>90-day best</dt><dd>{record.best90Days ? `${Math.round(record.best90Days.bestPowerWatts)} W` : "--"}</dd></div>
            </dl>
          </article>)}
        </div>
        <details className="pr-timeline">
          <summary><span>PR timeline</span><strong>{visibleTimeline.length} recent milestones</strong></summary>
          <div className="pr-timeline-list">
            {visibleTimeline.map((event) => <article key={`${event.durationSeconds}-${event.effort.rideId}-${event.effort.startedAt}`}>
              <time dateTime={event.effort.startedAt}>{dateLabel(event.effort.startedAt)}</time>
              <strong>{event.label} / {Math.round(event.effort.bestPowerWatts)} W</strong>
              <span>{event.effort.rideName}</span>
              <em>{event.improvementWatts === null ? "Baseline established" : `+${event.improvementWatts.toFixed(1)} W from the prior record`}</em>
            </article>)}
          </div>
        </details>
      </> : <div className="analysis-empty compact"><strong>No power-duration history yet.</strong><span>Import a FIT, TCX, or Strava ride with detailed power samples to establish your first records.</span></div>}
      <p className="chart-note"><i /> Records require a legitimate continuous window. Pauses and recording gaps are not bridged, and zero-power coasting remains part of the effort.</p>
    </section>
  );
}

function PlanToday({ rides, recovery, setRecovery, recoverySaveState, saveRecovery, currentFtp, setCurrentFtp, currentWeightKg, setCurrentWeightKg, currentLthr, setCurrentLthr, restingHeartRateBaseline }: {
  rides: Ride[];
  recovery: SubjectiveRecovery;
  setRecovery: (value: SubjectiveRecovery) => void;
  recoverySaveState: "idle" | "saving" | "saved" | "error";
  saveRecovery: () => Promise<void>;
  currentFtp: number;
  setCurrentFtp: (value: number) => void;
  currentWeightKg: number;
  setCurrentWeightKg: (value: number) => void;
  currentLthr: number | null;
  setCurrentLthr: (value: number | null) => void;
  restingHeartRateBaseline: number | null;
}) {
  const [insights, setInsights] = useState<PhaseThreeInsights | null>(null);
  const [goalTarget, setGoalTarget] = useState(200);
  const [ftpInput, setFtpInput] = useState(currentFtp);
  const [ftpSaveMessage, setFtpSaveMessage] = useState("");
  const [ftpSaveState, setFtpSaveState] = useState<"idle" | "working" | "success" | "error">("idle");
  const [weightInputPounds, setWeightInputPounds] = useState(Math.round(currentWeightKg * 2.2046226218));
  const [weightSaveMessage, setWeightSaveMessage] = useState("");
  const [weightSaveState, setWeightSaveState] = useState<"idle" | "working" | "success" | "error">("idle");
  const [lthrInput, setLthrInput] = useState(currentLthr === null ? "" : String(currentLthr));
  const [lthrSaveMessage, setLthrSaveMessage] = useState("");
  const [lthrSaveState, setLthrSaveState] = useState<"idle" | "working" | "success" | "error">("idle");
  const [actionState, setActionState] = useState<"idle" | "working" | "success" | "error">("idle");
  const [actionMessage, setActionMessage] = useState("");
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [worldRotation, setWorldRotation] = useState<ZwiftRotation | null>(null);
  const [routeShuffleIndex, setRouteShuffleIndex] = useState(0);
  const [recentRouteIds, setRecentRouteIds] = useState<string[]>([]);
  const [planStartDate, setPlanStartDate] = useState(localDateKey);

  const loadInsights = async () => {
    const response = await fetch("/api/phase3", { cache: "no-store" });
    const payload = await response.json() as PhaseThreeInsights & { error?: string };
    if (!response.ok) throw new Error(payload.error ?? "Training insights could not be loaded.");
    setInsights(payload);
    if (payload.currentFtpWatts !== null) {
      setCurrentFtp(payload.currentFtpWatts);
      setFtpInput(payload.currentFtpWatts);
    }
    if (payload.weightKg !== null) {
      setCurrentWeightKg(payload.weightKg);
      setWeightInputPounds(Math.round(payload.weightKg * 2.2046226218));
    }
    setCurrentLthr(payload.lthrBpm);
    setLthrInput(payload.lthrBpm === null ? "" : String(payload.lthrBpm));
    if (payload.goal) setGoalTarget(payload.goal.targetFtpWatts);
  };

  useEffect(() => {
    let active = true;
    void fetch("/api/phase3", { cache: "no-store" })
      .then(async (response) => ({ response, payload: await response.json() as PhaseThreeInsights & { error?: string } }))
      .then(({ response, payload }) => {
        if (!active) return;
        if (!response.ok) throw new Error(payload.error ?? "Training insights could not be loaded.");
        setInsights(payload);
        if (payload.currentFtpWatts !== null) {
          setCurrentFtp(payload.currentFtpWatts);
          setFtpInput(payload.currentFtpWatts);
        }
        if (payload.weightKg !== null) {
          setCurrentWeightKg(payload.weightKg);
          setWeightInputPounds(Math.round(payload.weightKg * 2.2046226218));
        }
        setCurrentLthr(payload.lthrBpm);
        setLthrInput(payload.lthrBpm === null ? "" : String(payload.lthrBpm));
        if (payload.goal) setGoalTarget(payload.goal.targetFtpWatts);
      })
      .catch(() => { if (active) setActionMessage("Saved insights are temporarily unavailable."); });
    return () => { active = false; };
  }, [setCurrentFtp, setCurrentLthr, setCurrentWeightKg]);

  useEffect(() => {
    let active = true;
    void fetch("/api/zwift/worlds")
      .then(async (response) => {
        if (!response.ok) throw new Error("Zwift world rotation could not be loaded.");
        return response.json() as Promise<ZwiftRotation>;
      })
      .then((rotation) => { if (active) setWorldRotation(rotation); })
      .catch(() => { if (active) setWorldRotation(null); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const updateCalendarDay = () => setPlanStartDate(localDateKey());
    const visibilityHandler = () => { if (document.visibilityState === "visible") updateCalendarDay(); };
    updateCalendarDay();
    const interval = window.setInterval(updateCalendarDay, 60 * 1000);
    document.addEventListener("visibilitychange", visibilityHandler);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", visibilityHandler);
    };
  }, []);

  const postAction = async (body: object, successMessage: string) => {
    setActionState("working");
    setActionMessage("");
    try {
      const response = await fetch("/api/phase3", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "The update could not be saved.");
      await loadInsights();
      setActionState("success");
      setActionMessage(successMessage);
    } catch (error) {
      setActionState("error");
      setActionMessage(error instanceof Error ? error.message : "The update could not be saved.");
    }
  };

  const saveFtp = async () => {
    const ftpWatts = Math.round(ftpInput);
    if (!Number.isFinite(ftpWatts) || ftpWatts < 50 || ftpWatts > 500) {
      setFtpSaveState("error");
      setFtpSaveMessage("Enter an FTP between 50 and 500 watts.");
      return;
    }
    if (ftpWatts === currentFtp) {
      setFtpSaveState("success");
      setFtpSaveMessage(`${ftpWatts} W is already your saved FTP.`);
      return;
    }

    setActionState("working");
    setActionMessage("");
    setFtpSaveState("working");
    setFtpSaveMessage("Saving your working FTP…");
    try {
      const response = await fetch("/api/phase3", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "record_ftp", ftpWatts }),
      });
      const payload = await response.json() as { ftpWatts?: number; unchanged?: boolean; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "FTP could not be saved.");
      await loadInsights();
      setActionState("success");
      setFtpSaveState("success");
      setFtpSaveMessage(payload.unchanged
        ? `${payload.ftpWatts ?? ftpWatts} W is already your saved FTP.`
        : `Saved. Your working FTP is now ${payload.ftpWatts ?? ftpWatts} W.`);
    } catch (error) {
      setActionState("error");
      setFtpSaveState("error");
      setFtpSaveMessage(error instanceof Error ? error.message : "FTP could not be saved.");
    }
  };

  const saveWeight = async () => {
    const weightPounds = Math.round(weightInputPounds);
    if (!Number.isFinite(weightPounds) || weightPounds < 80 || weightPounds > 500) {
      setWeightSaveState("error");
      setWeightSaveMessage("Enter a body weight between 80 and 500 pounds.");
      return;
    }
    setWeightSaveState("working");
    setWeightSaveMessage("Saving body weight…");
    try {
      const response = await fetch("/api/phase3", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "record_weight", weightPounds }),
      });
      const payload = await response.json() as { weightPounds?: number; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Body weight could not be saved.");
      await loadInsights();
      setWeightSaveState("success");
      setWeightSaveMessage(`Saved. Route estimates now use ${payload.weightPounds ?? weightPounds} lb.`);
    } catch (error) {
      setWeightSaveState("error");
      setWeightSaveMessage(error instanceof Error ? error.message : "Body weight could not be saved.");
    }
  };

  const saveLthr = async () => {
    const lthrBpm = lthrInput.trim() ? Math.round(Number(lthrInput)) : null;
    if (lthrBpm !== null && (!Number.isFinite(lthrBpm) || lthrBpm < 80 || lthrBpm > 220)) {
      setLthrSaveState("error");
      setLthrSaveMessage("Enter an LTHR between 80 and 220 bpm, or leave it blank.");
      return;
    }
    setLthrSaveState("working");
    setLthrSaveMessage("Saving heart-rate threshold…");
    try {
      const response = await fetch("/api/phase3", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "record_lthr", lthrBpm }),
      });
      const payload = await response.json() as { lthrBpm?: number | null; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "LTHR could not be saved.");
      const savedLthr = payload.lthrBpm ?? null;
      await loadInsights();
      setCurrentLthr(savedLthr);
      setLthrInput(savedLthr === null ? "" : String(savedLthr));
      setLthrSaveState("success");
      setLthrSaveMessage(savedLthr === null ? "LTHR cleared. Heart-rate zones are withheld." : `Saved ${savedLthr} bpm. Manually entered values stay labeled until you attach supporting ride evidence.`);
    } catch (error) {
      setLthrSaveState("error");
      setLthrSaveMessage(error instanceof Error ? error.message : "LTHR could not be saved.");
    }
  };

  const confirmLthrCandidate = async (rideId: string) => {
    setLthrSaveState("working");
    setLthrSaveMessage("Confirming the ride evidence...");
    try {
      const response = await fetch("/api/phase3", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "confirm_lthr_candidate", rideId }),
      });
      const payload = await response.json() as { lthrBpm?: number; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "The LTHR candidate could not be confirmed.");
      await loadInsights();
      const savedLthr = payload.lthrBpm!;
      setCurrentLthr(savedLthr);
      setLthrInput(String(savedLthr));
      setLthrSaveState("success");
      setLthrSaveMessage(`Confirmed ${savedLthr} bpm with its source ride and confidence. Future candidates will require another review.`);
    } catch (error) {
      setLthrSaveState("error");
      setLthrSaveMessage(error instanceof Error ? error.message : "The LTHR candidate could not be confirmed.");
    }
  };

  const dayMs = 24 * 60 * 60 * 1000;
  const referenceDate = planStartDate === localDateKey() ? new Date() : new Date(`${planStartDate}T12:00:00`);
  const anchorMs = referenceDate.getTime();
  const block = (startDaysAgo: number, endDaysAgo: number) => {
    const blockRides = rides.filter((ride) => {
      const timestamp = Date.parse(rideStartedAt(ride));
      return timestamp <= anchorMs - (endDaysAgo * dayMs) && timestamp > anchorMs - (startDaysAgo * dayMs);
    });
    const powered = blockRides.filter((ride) => ride.averagePower > 0);
    const efficient = blockRides.filter((ride) => ride.powerHeartRateRatio > 0);
    return {
      rides: blockRides.length,
      hours: blockRides.reduce((sum, ride) => sum + ride.movingTimeSeconds, 0) / 3600,
      load: blockRides.reduce((sum, ride) => sum + ride.trainingLoad, 0),
      averagePower: powered.length ? powered.reduce((sum, ride) => sum + ride.averagePower, 0) / powered.length : 0,
      efficiency: efficient.length ? efficient.reduce((sum, ride) => sum + ride.powerHeartRateRatio, 0) / efficient.length : 0,
    };
  };
  const currentBlock = block(42, 0);
  const priorBlock = block(84, 42);
  const referenceMs = referenceDate.getTime();
  const trainingLoad = buildTrainingLoadModel(
    rides.map((ride) => ({ date: rideStartedAt(ride), trainingLoad: ride.trainingLoad })),
    referenceDate,
  );
  const todayTraining = completedTrainingOnDate(rides, referenceDate);
  const latestHardRide = rides.filter(isObjectivelyHardRide).sort((a, b) => Date.parse(rideStartedAt(b)) - Date.parse(rideStartedAt(a)))[0];
  const readiness = calculateReadiness({
    hoursSinceLastHardRide: elapsedHoursSince(latestHardRide ? rideStartedAt(latestHardRide) : null, referenceMs),
    trainingLoadRatio: trainingLoad.current.loadRatio,
    subjective: recovery,
    todayTrainingLoad: todayTraining.trainingLoad,
    todayIntensityFactor: todayTraining.maximumIntensityFactor,
    todayMovingTimeSeconds: todayTraining.movingTimeSeconds,
    restingHeartRateBaseline,
    checkInRecorded: recoverySaveState === "saved",
  });
  const coach = buildCoachReport({
    rides: rides.map(coachAnalyticsRide),
    readinessScore: readiness.score,
    subjective: recovery,
    checkInRecorded: recoverySaveState === "saved",
    referenceDate,
  });
  const workout = coach;
  const availableWorlds = worldRotation?.availableWorlds ?? ["Watopia"];
  const currentWeightPounds = Math.round(currentWeightKg * 2.2046226218);
  const routeSuite = recommendZwiftRoutes(workout.mode, currentFtp, currentWeightKg, ZWIFT_WORLDS, routeShuffleIndex, recentRouteIds, currentLthr);
  const routeIntensity = ROUTE_INTENSITY_BANDS[workout.mode];
  const routePowerMinimum = Math.round(currentFtp * routeIntensity.low);
  const routePowerMaximum = Math.round(currentFtp * routeIntensity.high);
  const selectedRoute = routeSuite.find((suggestion) => suggestion.route.id === selectedRouteId)
    ?? routeSuite.find((suggestion) => suggestion.recommended)
    ?? routeSuite[0];
  const weeklyPlan = coach.weeklyPlan;
  const prediction = insights?.prediction;
  const projectedFromFtp = prediction?.midpointWatts ?? currentFtp;
  const projection = projectFtpGoal(projectedFromFtp, goalTarget, referenceDate.toISOString());
  const vo2 = insights?.vo2Estimate;
  const vo2Status = vo2?.status === "trend_ready" ? "trend ready" : vo2?.status === "provisional" ? "provisional" : "needs 5 min power";
  const lthrProfile = insights?.lthrProfile;
  const lthrCandidate = insights?.lthrCandidates[0];
  const lthrCandidateMatchesSavedValue = Boolean(lthrCandidate && currentLthr !== null && Math.abs(lthrCandidate.lthrBpm - currentLthr) <= 2);
  const lthrEvidenceConfirmed = Boolean(lthrCandidate && lthrProfile?.sourceRideId === lthrCandidate.rideId);
  const lthrSourceLabel = lthrProfile?.source === "ride_candidate"
    ? `observed effort${lthrProfile.sourceRideName ? `: ${lthrProfile.sourceRideName}` : ""}`
    : lthrProfile?.source === "field_test" ? "controlled field test" : "manually entered";
  const change = (current: number, previous: number, suffix = "") => previous ? `${current >= previous ? "+" : ""}${(current - previous).toFixed(1)}${suffix}` : "—";
  const projectionDate = (date: string | null) => date ? new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" }) : "—";
  const contributionLabel = coach.rideReflection.contribution === "quality_work" ? "Quality work" : coach.rideReflection.contribution === "aerobic_endurance" ? "Aerobic endurance" : coach.rideReflection.contribution === "easy_movement" ? "Easy movement" : "Fresh suggestion";
  const coachLoadStatus = coach.evidenceSummary.loadStatus === "established"
    ? coach.evidenceSummary.loadRatio !== null && coach.evidenceSummary.loadRatio > 1.3 ? "Fatigue elevated vs fitness" : "Established load history"
    : coach.evidenceSummary.loadStatus === "provisional" ? "Provisional 42-day history" : "History not ready";

  return (
    <div className="phase-three-layout">
      <section className="phase-three-hero panel-dark">
        <div><span className="eyebrow light">Coach Mode · {coach.confidence} confidence</span><h2>{workout.primary}</h2><p className="plan-hero-detail">{workout.detail}</p><small className="coach-version">{coach.algorithmVersion} · {coach.state}</small></div>
        <div className="forecast-stamp"><span>{readiness.postRideAdjusted ? "Post-ride" : "Readiness"}</span><strong>{readiness.score}</strong><small>{readiness.label}</small></div>
      </section>

      {actionMessage && <div className={`phase-action-message ${actionState}`}>{actionMessage}</div>}

      <RecoveryCheckIn recovery={recovery} setRecovery={setRecovery} recoverySaveState={recoverySaveState} saveRecovery={saveRecovery} readiness={readiness} restingHeartRateBaseline={restingHeartRateBaseline} />

      <section className={`coach-reflection panel full-width reflection-${coach.rideReflection.contribution}`}>
        <div className="section-heading"><div><span className="eyebrow">What today’s riding contributed</span><h2>{coach.rideReflection.headline}</h2><p>{coach.rideReflection.detail}</p></div><span className={`reflection-badge ${coach.rideReflection.contribution}`}>{contributionLabel}</span></div>
        <div className="coach-reflection-grid">
          <article><span>Encouragement</span><strong>{coach.rideReflection.encouragement}</strong><small>{coach.rideReflection.completedRideCount ? `${coach.rideReflection.completedMinutes} min · ${coach.rideReflection.completedLoad} load today` : "No ride required to earn a fresh suggestion"}</small></article>
          <article className="reflection-next"><span>A friendly next step</span><strong>{coach.rideReflection.nextSuggestion}</strong><small>The next suggestion adapts to your riding and recovery—never to a pass/fail score.</small></article>
        </div>
      </section>


      <section className={`coach-reasoning panel full-width state-${coach.state}`}>
        <div className="section-heading"><div><span className="eyebrow">Why this choice</span><h2>Every input stays visible</h2><p>The coach consumes existing analytics; it does not invent new fitness metrics.</p></div><span className={`confidence-badge confidence-${coach.confidence}`}>{coach.confidence} confidence</span></div>
        <div className="coach-load-equation" aria-label="Coach workload calculation">
          <article><span>7-day fatigue</span><strong>{coach.evidenceSummary.fatigueLoad?.toFixed(1) ?? "—"}</strong><small>modeled from daily load</small></article>
          <b>÷</b>
          <article><span>42-day fitness</span><strong>{coach.evidenceSummary.fitnessLoad?.toFixed(1) ?? "—"}</strong><small>{coach.evidenceSummary.loadHistoryDays} days observed</small></article>
          <b>=</b>
          <article className="coach-load-result"><span>Fatigue / fitness</span><strong>{coach.evidenceSummary.loadRatio === null ? "—" : `${coach.evidenceSummary.loadRatio.toFixed(2)}×`}</strong><small>{coachLoadStatus}</small></article>
        </div>
        <p className="coach-load-note">The same daily series drives both estimates. The ratio is withheld until the 42-day model has enough history; it informs caution and does not predict injury.</p>
        {currentLthr !== null && <p className="coach-lthr-note"><strong>Heart-rate guidance:</strong> Route cues use your {currentLthr} bpm LTHR ({lthrProfile?.confidence ?? "unrated"} confidence, {lthrSourceLabel}). Power, perceived effort, and symptoms still take precedence.</p>}
        <div className="coach-reason-grid">
          <article><span>Supports the choice</span>{coach.positives.length ? coach.positives.map((reason) => <p key={reason}><i>+</i>{reason}</p>) : <p><i>·</i>No positive signal changed the plan.</p>}</article>
          <article><span>Cautions</span>{coach.cautions.length ? coach.cautions.map((reason) => <p key={reason}><i>−</i>{reason}</p>) : <p><i>·</i>No caution changed the plan.</p>}</article>
          <article className="guardrail-evidence"><span>Safety guardrails</span>{coach.guardrails.length ? coach.guardrails.map((reason) => <p key={reason}><i>!</i>{reason}</p>) : <p><i>✓</i>No pain or illness override is active.</p>}</article>
        </div>
        <div className="avoid-strip"><span>Avoid today</span><strong>{workout.avoid}</strong></div>
        <div className="next-quality"><span>Next quality session</span><strong>{coach.nextQualitySession}</strong></div>
        <small className="coach-evidence-version">{coach.algorithmVersion} · check-in {coach.evidenceSummary.checkInRecorded ? "saved" : "needed"} · {coach.evidenceSummary.highQualityRides} detailed recent rides</small>
      </section>

      <section className="coach-insights panel full-width">
        <div className="section-heading"><div><span className="eyebrow">Evidence-backed insights</span><h2>Claims grow with the evidence</h2></div><span className={`confidence-badge confidence-${coach.trend.confidence}`}>{coach.trend.status} · {coach.trend.confidence}</span></div>
        <article className={`coach-trend trend-${coach.trend.direction}`}><div><span>{coach.trend.title}</span><strong>{coach.trend.summary}</strong></div><p>{coach.trend.evidence.join(" · ") || coach.trend.limitations[0]}</p>{coach.trend.limitations.length > 0 && <small>{coach.trend.limitations.join(" ")}</small>}</article>
        <div className="coach-baseline-grid">{coach.baselines.slice(0, 4).map((baseline) => <article key={baseline.trainingType}><span>{baseline.trainingType}</span><strong>{baseline.medianDurationMinutes} min <small>median</small></strong><p>{baseline.rideCount} rides · load {baseline.medianTrainingLoad}{baseline.medianEfficiency ? ` · ${baseline.medianEfficiency.toFixed(3)} W/bpm` : ""}</p></article>)}</div>
        <p className="chart-note"><i /> Possible = 2 supporting rides; likely = 3–4; established = at least 5 comparable rides across 3 weeks. Future prescriptions remain conditional.</p>
      </section>

      <section className="route-suite panel full-width">
        <div className="section-heading route-suite-heading">
          <div><span className="eyebrow">Route ideas for today</span><h2>Choose what makes you want to ride</h2><p>Each route includes a flexible focus, terrain cues, and an optional stretch idea. Change the effort, shorten the route, or ignore the numbers whenever that makes the ride better.</p></div>
          <span className={`small-badge ${workout.mode === "rest" ? "paused" : ""}`}>{workout.mode === "rest" ? "paused by rest guardrail" : "30 · 60 · 90 min"}</span>
        </div>

        <div className="route-deck" aria-live="polite">
          <span className="route-deck-copy"><small>Any-world mode · Personal route model</small><strong>{currentWeightPounds} lb · {Math.round(routeIntensity.low * 100)}–{Math.round(routeIntensity.high * 100)}% FTP · about {routePowerMinimum}–{routePowerMaximum} W average</strong><em>Times use today&apos;s suggested effort, your FTP, body weight, distance, and climbing. {ZWIFT_WORLDS.length} workout-accessible worlds · {ZWIFT_ROUTE_COUNT} curated routes. In rotation now: {availableWorlds.join(" · ")}.</em></span>
          <button type="button" className="route-shuffle" onClick={() => {
            const visibleRouteIds = routeSuite.map((suggestion) => suggestion.route.id);
            setRecentRouteIds((current) => [...new Set([...visibleRouteIds, ...current])].slice(0, 18));
            setSelectedRouteId(null);
            setRouteShuffleIndex((value) => value + 1);
          }}><span aria-hidden="true">↻</span> Shuffle routes</button>
        </div>

        {workout.mode === "rest" && <div className="route-guardrail"><strong>Routes are on hold today.</strong><span>Update the recovery check-in when you feel ready; the choices will unlock when the plan no longer calls for complete rest.</span></div>}

        <div className="route-choice-grid" role="radiogroup" aria-label="Choose a Zwift route by time commitment">
          {routeSuite.map((suggestion) => {
            const isSelected = selectedRoute.route.id === suggestion.route.id;
            const isInRotation = availableWorlds.includes(suggestion.route.world);
            return (
              <button
                type="button"
                key={`${suggestion.commitment}-${suggestion.route.id}`}
                className={`route-choice ${isSelected ? "selected" : ""}`}
                aria-pressed={isSelected}
                disabled={suggestion.disabled}
                onClick={() => setSelectedRouteId(suggestion.route.id)}
              >
                <span className="route-choice-head">
                  <span><small>{suggestion.commitment} min target · est. {suggestion.estimatedMinimumMinutes}–{suggestion.estimatedMaximumMinutes} min</small><strong>{suggestion.route.name}</strong></span>
                  <em>{suggestion.recommended ? "Best fit" : isSelected ? "Selected" : "Option"}</em>
                </span>

                <span className="route-image-wrap">
                  <img src={`/zwift-routes/${suggestion.route.id}.png`} width={355} height={290} loading="lazy" alt={`${suggestion.route.name} route map from Zwift`} />
                  <span className="official-route-label">Official Zwift map</span>
                </span>

                <span className="route-facts">
                  <span><small>{isInRotation ? "World · in rotation" : "World · workout access"}</small><strong>{suggestion.route.world}</strong></span>
                  <span><small>Distance</small><strong>{suggestion.route.distanceMiles.toFixed(1)} mi</strong></span>
                  <span><small>Climbing</small><strong>{suggestion.route.elevationFeet} ft</strong></span>
                </span>

                <span className="route-prescription">
                  <span><small>Power guide</small><strong>{suggestion.targetWatts}</strong></span>
                  <span><small>Feel cue</small><strong>{suggestion.heartRateCue}</strong></span>
                </span>
                <span className="route-intention">
                  <span><small>Today’s idea</small><strong>{suggestion.focus}</strong></span>
                  <p>{suggestion.rideCue}</p>
                  <p>{suggestion.terrainCue}</p>
                  <em><strong>Optional stretch:</strong> {suggestion.optionalStretch}</em>
                  <small>{suggestion.encouragement}</small>
                </span>
                <span className="route-reason">{suggestion.reason}</span>
                <span className="route-time-cue">{suggestion.timingCue}</span>
              </button>
            );
          })}
        </div>

        <div className="route-suite-footer">
          <span>{workout.mode === "rest" ? "Rest is a useful option today; these routes will still be here later." : <><strong>Your current idea:</strong> {selectedRoute.route.name} · {selectedRoute.focus} · {selectedRoute.estimatedMinimumMinutes}–{selectedRoute.estimatedMaximumMinutes} min</>}</span>
          <span className="route-source-links"><a href="https://support.zwift.com/zwift-worlds-and-cycling-routes-rk3PMBUht" target="_blank" rel="noreferrer">Official route details ↗</a><a href={worldRotation?.sourceUrl ?? "https://zwiftinsider.com/schedule/"} target="_blank" rel="noreferrer">World calendar ↗</a></span>
        </div>
      </section>

      <section className="weekly-plan panel full-width">
        <div className="section-heading"><div><span className="eyebrow">The next seven days</span><h2>A useful plan, not a rigid prescription</h2></div><span className="small-badge">updates daily · local time</span></div>
        <div className="week-grid">{weeklyPlan.map((day, index) => <article key={day.dateIso} className={`${index === 0 ? "today" : ""} ${day.adaptive ? "adaptive" : ""}`}><div className="week-date"><span>{index === 0 ? "Today" : day.day}</span><em>{day.dateLabel}</em></div><strong>{day.session}</strong><small>{day.purpose}</small><em className="day-confidence">{day.adaptive ? "conditional · " : ""}{day.confidence} confidence</em></article>)}</div>
        <p className="chart-note"><i /> Today is evidence-gated. Future days are low-confidence placeholders that are regenerated at local midnight and after every saved check-in or ride import.</p>
      </section>

      <section className="ftp-forecast panel">
        <div className="section-heading"><div><span className="eyebrow">Automatic FTP prediction</span><h2>{prediction?.minimumWatts !== null && prediction?.minimumWatts !== undefined ? `${prediction.minimumWatts}–${prediction.maximumWatts} W` : "More evidence needed"}</h2></div><span className="small-badge">{prediction?.confidence ?? "loading"} confidence</span></div>
        <div className="forecast-scale"><i style={{ width: `${Math.min(100, Math.max(4, ((prediction?.midpointWatts ?? currentFtp) / Math.max(250, goalTarget)) * 100))}%` }} /></div>
        <div className="signal-list">{(prediction?.signals ?? ["Import a ride with 20–60 minutes of recorded power."]).map((signal) => <span key={signal}>· {signal}</span>)}</div>
        <div className="confirm-ftp"><label><span>Working FTP</span><input type="number" min="50" max="500" value={ftpInput} onChange={(event) => { setFtpInput(Number(event.target.value)); setFtpSaveMessage(""); setFtpSaveState("idle"); }} /></label>{prediction?.midpointWatts && <button className="text-button" onClick={() => { setFtpInput(prediction.midpointWatts!); setFtpSaveMessage(""); setFtpSaveState("idle"); }}>Use midpoint</button>}<button className="primary-button" onClick={() => void saveFtp()} disabled={actionState === "working"}>{ftpSaveState === "working" ? "Saving…" : "Save FTP"}</button></div>
        <p className={`ftp-save-status ${ftpSaveState}`} aria-live="polite">{ftpSaveMessage || `Current saved FTP: ${currentFtp} W.`}</p>
        <div className="confirm-ftp"><label><span>Body weight (lb)</span><input type="number" min="80" max="500" value={weightInputPounds} onChange={(event) => { setWeightInputPounds(Number(event.target.value)); setWeightSaveMessage(""); setWeightSaveState("idle"); }} /></label><button className="primary-button" onClick={() => void saveWeight()} disabled={weightSaveState === "working"}>{weightSaveState === "working" ? "Saving…" : "Save weight"}</button></div>
        <p className={`ftp-save-status ${weightSaveState}`} aria-live="polite">{weightSaveMessage || `Current route-estimate weight: ${currentWeightPounds} lb.`}</p>
        <div className="confirm-ftp"><label><span>LTHR (optional bpm)</span><input type="number" min="80" max="220" value={lthrInput} placeholder="Not set" onChange={(event) => { setLthrInput(event.target.value); setLthrSaveMessage(""); setLthrSaveState("idle"); }} /></label><button className="primary-button" onClick={() => void saveLthr()} disabled={lthrSaveState === "working"}>{lthrSaveState === "working" ? "Saving…" : currentLthr === null ? "Add LTHR" : "Save LTHR"}</button></div>
        <p className={`ftp-save-status ${lthrSaveState}`} aria-live="polite">{lthrSaveMessage || (currentLthr === null ? "Optional: confirm a qualifying ride below or enter a tested value." : `Current LTHR: ${currentLthr} bpm - ${lthrProfile?.confidence ?? "unrated"} confidence, ${lthrSourceLabel}.`)}</p>
        {currentLthr !== null && <div className="lthr-zone-guide">{HEART_RATE_ZONES.map((zone, index) => <span key={zone.key}><strong>{zone.shortLabel}</strong><small>{heartRateZoneRange(currentLthr, index)}</small></span>)}</div>}
        {lthrCandidate ? <article className="lthr-candidate-card">
          <div className="lthr-candidate-heading"><span><small>Reviewable threshold evidence</small><strong>{lthrEvidenceConfirmed && currentLthr !== null ? `${currentLthr} bpm confirmed` : `${lthrCandidate.lthrBpm} bpm candidate`}</strong><em>{lthrCandidate.rideName} - {new Date(lthrCandidate.startedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</em></span><span className={`confidence-badge confidence-${lthrCandidate.confidence}`}>{lthrCandidate.confidence} confidence</span></div>
          <div className="lthr-candidate-metrics">
            <span><small>Clean window</small><strong>{Math.round(lthrCandidate.windowStartSeconds / 60)}-{Math.round(lthrCandidate.windowEndSeconds / 60)} min</strong></span>
            <span><small>Power</small><strong>{Math.round(lthrCandidate.averagePowerWatts)} W</strong><em>{lthrCandidate.powerPercentFtp.toFixed(1)}% FTP</em></span>
            <span><small>Heart rate</small><strong>{lthrCandidate.averageHeartRateBpm.toFixed(1)} bpm</strong><em>{lthrCandidate.minimumHeartRateBpm}-{lthrCandidate.maximumHeartRateBpm} bpm</em></span>
            <span><small>Stability</small><strong>{lthrCandidate.heartRateChangeBpm >= 0 ? "+" : ""}{lthrCandidate.heartRateChangeBpm.toFixed(1)} bpm</strong><em>first vs final 5 min</em></span>
          </div>
          <div className="lthr-candidate-copy">{lthrCandidate.evidence.map((item) => <p key={item}>{item}</p>)}</div>
          {lthrCandidate.limitations.length > 0 && <p className="lthr-limitations"><strong>Why it remains provisional:</strong> {lthrCandidate.limitations.join(" ")}</p>}
          <div className="lthr-candidate-action"><span>{lthrEvidenceConfirmed ? "This evidence is attached to your saved LTHR." : lthrCandidateMatchesSavedValue ? `Your saved ${currentLthr} bpm is within the estimate's precision; confirmation attaches the evidence without changing it.` : "Your saved value changes only if you confirm this candidate."}</span><button className="secondary-button" type="button" disabled={lthrSaveState === "working" || lthrEvidenceConfirmed} onClick={() => void confirmLthrCandidate(lthrCandidate.rideId)}>{lthrEvidenceConfirmed ? "Evidence confirmed" : lthrCandidateMatchesSavedValue ? "Attach evidence" : `Use ${lthrCandidate.lthrBpm} bpm`}</button></div>
          <small className="lthr-algorithm">{lthrCandidate.algorithmVersion} - estimates never overwrite your profile automatically</small>
        </article> : <div className="lthr-candidate-empty"><strong>No qualifying threshold effort found yet.</strong><span>A future steady 25-30 minute effort near FTP with complete power and heart-rate samples can appear here for review.</span></div>}
        <p className="chart-note"><i /> Predictions are advisory ranges. Your working FTP changes only after you confirm it.</p>
      </section>

      <section className="vo2-card panel">
        <div className="section-heading"><div><span className="eyebrow">Aerobic capacity proxy</span><h2>{vo2?.estimateMlKgMin !== null && vo2?.estimateMlKgMin !== undefined ? vo2.estimateMlKgMin.toFixed(1) : "More evidence needed"}</h2></div><span className="small-badge">{vo2Status}</span></div>
        {vo2?.estimateMlKgMin !== null && vo2?.estimateMlKgMin !== undefined ? <>
          <div className="vo2-summary"><div><span>Estimated cycling VO₂ max</span><strong>{vo2.estimateMlKgMin.toFixed(1)}</strong><small>mL/kg/min · rolling 90-day peak</small></div><div><span>Five-minute power</span><strong>{vo2.fiveMinutePowerWatts ?? "—"}</strong><small>W · {vo2.wattsPerKg?.toFixed(2) ?? "—"} W/kg</small></div><div><span>vs prior 90 days</span><strong>{vo2.changePercent === null ? "—" : `${vo2.changePercent >= 0 ? "+" : ""}${vo2.changePercent.toFixed(1)}%`}</strong><small>{vo2.effortCount} recorded efforts in current window</small></div></div>
          <div className="vo2-trend" role="img" aria-label="Rolling 90-day estimated cycling VO2 max trend on a zero-based scale">
            {vo2.points.map((point, index) => <span key={`${point.startedAt}-${index}`}><i style={{ height: `${Math.max(4, Math.min(100, (point.estimateMlKgMin / 70) * 100))}%` }} /><small>{new Date(point.startedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</small></span>)}
          </div>
        </> : <div className="analysis-empty"><strong>No five-minute power evidence yet.</strong><span>Import a powered ride with at least five continuous minutes of detailed data.</span></div>}
        <p className="chart-note"><i /> Formula: 16.6 + 8.87 × five-minute W/kg. Use the trend—not the absolute number. It assumes the five-minute effort was maximal and is not a lab measurement.</p>
      </section>

      <PowerRecordsCard history={insights?.powerRecords} />

      <section className="goal-card panel">
        <div className="section-heading"><div><span className="eyebrow">Goal projection</span><h2>{goalTarget} W FTP</h2></div></div>
        <div className="goal-control"><label><span>Target</span><select value={goalTarget} onChange={(event) => setGoalTarget(Number(event.target.value))}>{[175, 200, 225, 250].map((target) => <option key={target} value={target}>{target} W</option>)}</select></label><button className="secondary-button" onClick={() => void postAction({ action: "set_goal", targetFtpWatts: goalTarget }, `${goalTarget} W goal saved.`)} disabled={actionState === "working"}>Save goal</button></div>
        <div className="projection-list"><div><span>Aggressive</span><strong>{projectionDate(projection.aggressiveDate)}</strong></div><div><span>Current trend</span><strong>{projectionDate(projection.currentTrendDate)}</strong></div><div><span>Conservative</span><strong>{projectionDate(projection.conservativeDate)}</strong></div></div>
        <p>{projection.disclaimer}</p>
      </section>

      <section className="block-card panel">
        <div className="section-heading"><div><span className="eyebrow">Training-block comparison</span><h2>Recent 6 weeks vs prior 6</h2></div></div>
        <div className="block-table"><span>Metric</span><span>Prior</span><span>Recent</span><span>Change</span><strong>Rides</strong><span>{priorBlock.rides}</span><span>{currentBlock.rides}</span><b>{change(currentBlock.rides, priorBlock.rides)}</b><strong>Hours</strong><span>{priorBlock.hours.toFixed(1)}</span><span>{currentBlock.hours.toFixed(1)}</span><b>{change(currentBlock.hours, priorBlock.hours, "h")}</b><strong>Avg power</strong><span>{priorBlock.averagePower.toFixed(0)} W</span><span>{currentBlock.averagePower.toFixed(0)} W</span><b>{change(currentBlock.averagePower, priorBlock.averagePower, " W")}</b><strong>W / bpm</strong><span>{priorBlock.efficiency.toFixed(3)}</span><span>{currentBlock.efficiency.toFixed(3)}</span><b>{change(currentBlock.efficiency, priorBlock.efficiency)}</b><strong>Load</strong><span>{priorBlock.load.toFixed(0)}</span><span>{currentBlock.load.toFixed(0)}</span><b>{change(currentBlock.load, priorBlock.load)}</b></div>
      </section>

    </div>
  );
}

function ConnectedSources({ refreshRides, showSettings }: { refreshRides: () => Promise<void>; showSettings: boolean }) {
  const [insights, setInsights] = useState<PhaseThreeInsights | null>(null);
  const [settings, setSettings] = useState<StravaSettings | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(showSettings);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [actionState, setActionState] = useState<"idle" | "working" | "success" | "error">("idle");
  const [actionMessage, setActionMessage] = useState("");

  const loadInsights = useCallback(async () => {
    const response = await fetch("/api/phase3", { cache: "no-store" });
    const payload = await response.json() as PhaseThreeInsights & { error?: string };
    if (!response.ok) throw new Error(payload.error ?? "Connected sources could not be loaded.");
    setInsights(payload);
  }, []);

  const loadSettings = useCallback(async () => {
    const response = await fetch("/api/settings/strava", { cache: "no-store" });
    const payload = await response.json() as StravaSettings & { error?: string };
    if (!response.ok) throw new Error(payload.error ?? "Strava settings could not be loaded.");
    setSettings(payload);
    setClientId(payload.clientId ?? "");
  }, []);

  useEffect(() => {
    let active = true;
    void fetch("/api/phase3", { cache: "no-store" })
      .then(async (response) => ({ response, payload: await response.json() as PhaseThreeInsights & { error?: string } }))
      .then(({ response, payload }) => {
        if (!active) return;
        if (!response.ok) throw new Error(payload.error ?? "Connected sources could not be loaded.");
        setInsights(payload);
      })
      .catch(() => { if (active) setActionMessage("Connection status is temporarily unavailable."); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    void fetch("/api/settings/strava", { cache: "no-store" })
      .then(async (response) => ({ response, payload: await response.json() as StravaSettings & { error?: string } }))
      .then(({ response, payload }) => {
        if (!active) return;
        if (!response.ok) throw new Error(payload.error ?? "Strava settings could not be loaded.");
        setSettings(payload);
        setClientId(payload.clientId ?? "");
      })
      .catch(() => { if (active) setActionMessage("Strava settings are temporarily unavailable."); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!showSettings) return;
    const timer = window.setTimeout(() => setSettingsOpen(true), 0);
    return () => window.clearTimeout(timer);
  }, [showSettings]);

  useEffect(() => {
    const refreshAfterExternalAuthorization = () => {
      void Promise.all([loadInsights(), loadSettings()])
        .catch(() => setActionMessage("Strava connection status could not be refreshed."));
    };
    window.addEventListener("focus", refreshAfterExternalAuthorization);
    return () => window.removeEventListener("focus", refreshAfterExternalAuthorization);
  }, [loadInsights, loadSettings]);

  const saveStravaSettings = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setActionState("working");
    setActionMessage("Saving Strava credentials on this device...");
    try {
      const response = await fetch("/api/settings/strava", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientId, clientSecret }),
      });
      const payload = await response.json() as StravaSettings & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Strava credentials could not be saved.");
      setSettings(payload);
      setClientId(payload.clientId ?? "");
      setClientSecret("");
      await loadInsights();
      setActionState("success");
      setActionMessage("Strava credentials saved locally. You can connect your account now.");
    } catch (error) {
      setActionState("error");
      setActionMessage(error instanceof Error ? error.message : "Strava credentials could not be saved.");
    }
  };

  const removeStravaSettings = async () => {
    setActionState("working");
    setActionMessage("Removing local Strava credentials...");
    try {
      const response = await fetch("/api/settings/strava", { method: "DELETE" });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Strava credentials could not be removed.");
      await Promise.all([loadInsights(), loadSettings()]);
      setClientSecret("");
      setActionState("success");
      setActionMessage("Strava credentials and tokens were removed. Saved rides remain in your log.");
    } catch (error) {
      setActionState("error");
      setActionMessage(error instanceof Error ? error.message : "Strava credentials could not be removed.");
    }
  };

  const syncStrava = async (mode: "new" | "six_months") => {
    setActionState("working");
    setActionMessage(mode === "six_months"
      ? "Importing six months of Strava rides… Summaries are saved first, then detailed streams are added within the rate limit."
      : "Checking Strava for new rides…");
    try {
      const response = await fetch("/api/integrations/strava/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      const payload = await response.json() as {
        imported?: number;
        skipped?: number;
        streamsImported?: number;
        streamsReprocessed?: number;
        streamFailures?: number;
        streamDeferred?: number;
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error ?? "Strava sync failed.");
      await refreshRides();
      await loadInsights();
      setActionState("success");
      const base = mode === "six_months"
        ? `${payload.imported ?? 0} rides saved from the last six months · ${payload.skipped ?? 0} already stored`
        : `${payload.imported ?? 0} new rides saved · ${payload.skipped ?? 0} existing rides checked`;
      const streamNote = payload.streamsImported ? ` · ${payload.streamsImported} detailed streams added` : "";
      const reprocessedNote = payload.streamsReprocessed ? ` · ${payload.streamsReprocessed} stored rides recalculated` : "";
      const deferredNote = payload.streamDeferred ? ` · ${payload.streamDeferred} detailed streams will fill in on a later import` : "";
      const failureNote = payload.streamFailures ? ` · ${payload.streamFailures} stream requests unavailable` : "";
      setActionMessage(`${base}${streamNote}${reprocessedNote}${deferredNote}${failureNote}`);
    } catch (error) {
      setActionState("error");
      setActionMessage(error instanceof Error ? error.message : "Strava sync failed.");
    }
  };

  const disconnectStrava = async () => {
    setActionState("working");
    try {
      const response = await fetch("/api/integrations/strava/disconnect", { method: "POST" });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Strava could not be disconnected.");
      await Promise.all([loadInsights(), loadSettings()]);
      setActionState("success");
      setClientSecret("");
      setActionMessage("Strava access was revoked and local credentials were removed. Synced rides remain in your private log.");
    } catch (error) {
      setActionState("error");
      setActionMessage(error instanceof Error ? error.message : "Strava could not be disconnected.");
    }
  };

  return (
    <section className="connections-card panel full-width">
      <div className="section-heading"><div><span className="eyebrow">Connected sources</span><h2>Bring activities in automatically</h2></div><span className="small-badge">private account</span></div>
      {actionMessage && <div className={`phase-action-message ${actionState}`}>{actionMessage}</div>}
      <div className="connection-grid">
        <article className="connection-tile strava-source">
          <div className="connection-mark strava">S</div>
          <div>
            <strong>Strava</strong>
            <span>{insights?.integrations.strava.connected ? `Connected${insights.integrations.strava.displayName ? ` · ${insights.integrations.strava.displayName}` : ""}` : insights?.integrations.strava.configured ? "Ready to connect with read-only activity access" : "App registration credentials are still needed"}</span>
            {insights?.integrations.strava.connected && <small>Automatic sync runs when the app opens or returns to focus, then every 15 minutes while open. Strava IDs prevent duplicates.</small>}
            {insights?.integrations.strava.lastSyncedAt && <small>Last sync {new Date(insights.integrations.strava.lastSyncedAt).toLocaleString()}</small>}
          </div>
          <div className="connection-actions">
            {insights?.integrations.strava.connected ? <>
              <button className="primary-button" onClick={() => void syncStrava("new")} disabled={actionState === "working"}>Sync new rides</button>
              <button className="secondary-button" onClick={() => void syncStrava("six_months")} disabled={actionState === "working"}>Import last 6 months</button>
              <button className="text-button" onClick={() => setSettingsOpen((open) => !open)} disabled={actionState === "working"}>Credentials</button>
              <button className="text-button" onClick={() => void disconnectStrava()} disabled={actionState === "working"}>Disconnect</button>
            </> : <>
              <button className="primary-button strava-button" onClick={() => settings?.configured ? window.location.assign("/api/integrations/strava/start") : setSettingsOpen(true)}>{settings?.configured ? "Connect with Strava" : "Configure Strava"}</button>
              {settings?.configured && <button className="text-button" onClick={() => setSettingsOpen((open) => !open)}>Edit credentials</button>}
            </>}
          </div>
        </article>
        <article className="connection-tile"><div className="connection-mark garmin">G</div><div><strong>Garmin Connect</strong><span>Cloud sync requires Garmin Developer Program approval.</span><small>Garmin FIT files already receive full stream analysis.</small></div><a className="secondary-link" href="https://developer.garmin.com/gc-developer-program/activity-api/" target="_blank" rel="noreferrer">Application details ↗</a></article>
      </div>
      {settingsOpen && <form className="strava-settings-panel" onSubmit={saveStravaSettings}>
        <div className="strava-settings-copy">
          <span className="eyebrow">Local Strava application</span>
          <h3>{settings?.configured ? "Update API credentials" : "Connect your own Strava API application"}</h3>
          <p>Create an application at <a href="https://www.strava.com/settings/api" target="_blank" rel="noreferrer">strava.com/settings/api</a>. Set the Authorization Callback Domain to <code>127.0.0.1</code>. The local callback is <code>http://127.0.0.1:8722/api/integrations/strava/callback</code>.</p>
          <small>{settings?.storage === "operating-system-encrypted"
            ? "The desktop app encrypts these values with your operating system's credential protection. They are never stored in SQLite."
            : "These values stay in an owner-only local file and are never stored in SQLite. The desktop app upgrades them to operating-system encryption."}</small>
        </div>
        <label><span>Client ID</span><input type="text" autoComplete="off" required value={clientId} onChange={(event) => setClientId(event.target.value)} /></label>
        <label><span>Client secret</span><input type="password" autoComplete="new-password" required value={clientSecret} onChange={(event) => setClientSecret(event.target.value)} placeholder={settings?.configured ? "Enter again to replace" : "Paste client secret"} /></label>
        <div className="strava-settings-actions">
          <button className="primary-button" type="submit" disabled={actionState === "working"}>{actionState === "working" ? "Saving..." : "Save credentials"}</button>
          <button className="text-button" type="button" onClick={() => setSettingsOpen(false)}>Close</button>
          {settings?.configured && <button className="text-button danger" type="button" onClick={() => void removeStravaSettings()} disabled={actionState === "working"}>Remove credentials</button>}
        </div>
      </form>}
    </section>
  );
}

function ImportRide({ detected, filename, error, isReading, isSaving, isDragging, hasFile, rideType, setRideType, rideContext, setRideContext, routeName, setRouteName, environment, setEnvironment, workoutSubtype, setWorkoutSubtype, setIsDragging, fileInput, onFileChange, onDrop, onDemo, onAdd, onReset }: {
  detected: DetectedActivity | null;
  filename: string;
  error: string;
  isReading: boolean;
  isSaving: boolean;
  isDragging: boolean;
  hasFile: boolean;
  rideType: Ride["type"];
  setRideType: (value: Ride["type"]) => void;
  rideContext: RideContext;
  setRideContext: (value: RideContext) => void;
  routeName: string;
  setRouteName: (value: string) => void;
  environment: RideEnvironment;
  setEnvironment: (value: RideEnvironment) => void;
  workoutSubtype: WorkoutSubtype;
  setWorkoutSubtype: (value: WorkoutSubtype) => void;
  setIsDragging: (value: boolean) => void;
  fileInput: React.RefObject<HTMLInputElement | null>;
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onDrop: (event: DragEvent<HTMLDivElement>) => void;
  onDemo: () => void;
  onAdd: () => Promise<void>;
  onReset: () => void;
}) {
  return (
    <div className="import-layout">
      <section className="import-intro">
        <span className="eyebrow">Original files first</span>
        <h2>Bring the ride home.</h2>
        <p>Import the richest recording available. Your original file and calculated ride are saved privately, and the dashboard reloads them on your next visit.</p>
        <ol>
          <li><span>01</span><div><strong>Upload</strong><small>FIT, TCX, or GPX activity file</small></div></li>
          <li><span>02</span><div><strong>Review</strong><small>Confirm detected and missing values</small></div></li>
          <li><span>03</span><div><strong>Save</strong><small>Store the original and transparent metrics</small></div></li>
        </ol>
      </section>
      <section className="import-workspace panel">
        {!detected ? <>
          <div className={`dropzone ${isDragging ? "dragging" : ""}`} onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }} onDragLeave={() => setIsDragging(false)} onDrop={onDrop}>
            <input ref={fileInput} type="file" accept=".fit,.tcx,.gpx" onChange={onFileChange} hidden />
            <div className="file-glyph">↑</div>
            <h3>{isReading ? "Reading the activity…" : "Drop a ride file here"}</h3>
            <p>Original FIT preferred · TCX and GPX accepted · 25 MB maximum</p>
            <button className="secondary-button" onClick={() => fileInput.current?.click()} disabled={isReading}>Choose a file</button>
          </div>
          {filename && <div className={`file-message ${error ? "error" : ""}`}><strong>{filename}</strong><span>{error || "Ready for review"}</span></div>}
          <div className="demo-callout"><div><strong>No export nearby?</strong><span>Preview the review flow. Demo rides are never saved.</span></div><button className="text-button" onClick={onDemo}>Use demo file →</button></div>
        </> : (
          <div className="review-panel">
            <div className="review-heading"><div><span className="eyebrow">Detected ride · {detected.sampleCount.toLocaleString()} samples</span><h2>{detected.name}</h2><p>{filename}</p></div><span className="small-badge">{hasFile ? "Ready to save" : "Demo only"}</span></div>
            <div className="detected-grid">
              <ReviewField label="Start" value={detected.startedAt ? new Date(detected.startedAt).toLocaleString() : "Missing"} />
              <ReviewField label="Moving time" value={detected.movingTimeSeconds ? formatDuration(detected.movingTimeSeconds) : "Missing"} />
              <ReviewField label="Distance" value={detected.distanceMeters ? `${miles(detected.distanceMeters)} mi` : "Missing"} />
              <ReviewField label="Elevation" value={detected.elevationGainMeters ? `${feet(detected.elevationGainMeters)} ft` : "Missing"} />
              <ReviewField label="Average power" value={detected.averagePower ? `${Math.round(detected.averagePower)} W` : "Missing"} />
              <ReviewField label="Average HR" value={detected.averageHeartRate ? `${Math.round(detected.averageHeartRate)} bpm` : "Missing"} />
              <ReviewField label="Cadence" value={detected.averageCadence ? `${Math.round(detected.averageCadence)} rpm` : "Missing"} />
              <label className="review-field"><span>Route / course</span><input value={routeName} onChange={(event) => setRouteName(event.target.value)} placeholder="Use the same name for repeated routes" /></label>
              <label className="review-field"><span>Ride type</span><select value={rideType} onChange={(event) => setRideType(event.target.value as Ride["type"])}>{rideTypes.map((type) => <option key={type}>{type}</option>)}</select></label>
              <label className="review-field"><span>Environment</span><select value={environment} onChange={(event) => setEnvironment(event.target.value as RideEnvironment)}><option value="virtual">Virtual / Indoor</option><option value="indoor">Indoor</option><option value="outdoor">Outdoor</option></select></label>
              <label className="review-field"><span>Ride context</span><select value={rideContext} onChange={(event) => setRideContext(event.target.value as RideContext)}>{rideContexts.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
              <label className="review-field"><span>Workout subtype</span><select value={workoutSubtype ?? ""} onChange={(event) => setWorkoutSubtype(event.target.value ? event.target.value as Exclude<WorkoutSubtype, null> : null)}><option value="">None</option><option value="trainer_workout">Trainer Workout</option><option value="race">Race</option></select></label>
            </div>
            {detected.warnings.length > 0 && <div className="warning-box"><strong>Check before saving</strong>{detected.warnings.map((warning) => <span key={warning}>· {warning}</span>)}</div>}
            {error && <div className="warning-box error"><strong>Could not save this ride</strong><span>{error}</span></div>}
            <div className="review-actions"><button className="ghost-button" onClick={onReset} disabled={isSaving}>Start over</button><button className="primary-button wide" onClick={() => void onAdd()} disabled={isSaving}>{isSaving ? "Saving securely…" : hasFile ? "Save to ride log" : "Preview demo ride"} <span>→</span></button></div>
          </div>
        )}
      </section>
    </div>
  );
}

function ReviewField({ label, value }: { label: string; value: string }) {
  return <label className="review-field"><span>{label}</span><input value={value} readOnly /></label>;
}
