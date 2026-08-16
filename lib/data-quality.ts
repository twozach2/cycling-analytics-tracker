import { normalizeStreamRecordCounts, type StreamRecordCounts } from "./stream-counts";

export const DATA_QUALITY_VERSION = "data-quality-v2";

export type EvidenceLevel = "high" | "moderate" | "low";
export type SignalStatus = "recorded_stream" | "recorded_summary" | "derived" | "unavailable";

export type DataSignal = {
  id: "time" | "power" | "heart_rate" | "cadence" | "distance" | "elevation";
  label: string;
  status: SignalStatus;
  detail: string;
  recordCount: number | null;
};

export type RideDataQualityInput = {
  source: string;
  sourceFilename?: string | null;
  sourceFileType?: string | null;
  sampleCount?: number | null;
  availableStreams?: readonly string[] | string | null;
  streamSampleCounts?: StreamRecordCounts | string | null;
  movingTimeSeconds: number;
  averagePowerWatts?: number | null;
  averageHeartRateBpm?: number | null;
  averageCadenceRpm?: number | null;
  distanceMeters?: number | null;
  elevationGainMeters?: number | null;
  normalizedPowerSource?: "recorded" | "computed" | "unavailable" | string | null;
  intensityIsEstimated?: boolean | null;
  trainingLoadIsEstimated?: boolean | null;
  storedDataQuality?: "high" | "medium" | "low" | string | null;
  metricsAlgorithmVersion?: string | null;
};

export type RideDataQuality = {
  version: typeof DATA_QUALITY_VERSION;
  level: EvidenceLevel;
  label: string;
  sourceLabel: string;
  sourceFilename: string | null;
  streamMode: "detailed" | "summary_only";
  sampleCount: number | null;
  availableStreams: string[];
  signals: DataSignal[];
  recordedStreamCount: number;
  availableSignalCount: number;
  limitations: string[];
  recommendationEligible: boolean;
  metricsAlgorithmVersion: string;
  normalizedPowerStatus: SignalStatus;
  intensityStatus: "recorded_basis" | "computed_basis" | "estimated" | "unavailable";
  trainingLoadStatus: "recorded_basis" | "computed_basis" | "estimated" | "unavailable";
};

const streamAliases: Record<DataSignal["id"], readonly string[]> = {
  time: ["time", "timestamp"],
  power: ["watts", "power"],
  heart_rate: ["heartrate", "heart_rate", "hr"],
  cadence: ["cadence"],
  distance: ["distance", "latlng", "position_lat", "position_long"],
  elevation: ["altitude", "elevation", "enhanced_altitude"],
};

const signalLabels: Record<DataSignal["id"], string> = {
  time: "Timing",
  power: "Power",
  heart_rate: "Heart rate",
  cadence: "Cadence",
  distance: "Distance / position",
  elevation: "Elevation",
};

function parseAvailableStreams(value: RideDataQualityInput["availableStreams"]) {
  if (Array.isArray(value)) return [...new Set(value.map(String).map((entry) => entry.trim().toLowerCase()).filter(Boolean))];
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed)) return [...new Set(parsed.map(String).map((entry) => entry.trim().toLowerCase()).filter(Boolean))];
  } catch {
    return [...new Set(value.split(",").map((entry) => entry.trim().toLowerCase()).filter(Boolean))];
  }
  return [];
}

function sourceLabel(source: string, fileType?: string | null) {
  if (source === "strava_export") return "Strava activity and detailed streams";
  if (source === "fit" || fileType === "fit") return "Original FIT activity file";
  if (source === "tcx" || fileType === "tcx") return "Original TCX activity file";
  if (source === "gpx" || fileType === "gpx") return "Original GPX activity file";
  if (source === "zwift") return "Zwift activity file";
  return "Manual or summary activity";
}

export function assessRideDataQuality(input: RideDataQualityInput): RideDataQuality {
  const availableStreams = parseAvailableStreams(input.availableStreams);
  const streamSampleCounts = normalizeStreamRecordCounts(input.streamSampleCounts);
  const hasSamples = Number.isFinite(input.sampleCount) && (input.sampleCount ?? 0) > 0;
  const recordCount = (id: DataSignal["id"]) => Math.max(0, ...streamAliases[id].map((alias) => streamSampleCounts[alias] ?? 0)) || null;
  const hasStream = (id: DataSignal["id"]) => recordCount(id) !== null || (hasSamples && streamAliases[id].some((alias) => availableStreams.includes(alias)));
  const summaryValues: Record<DataSignal["id"], boolean> = {
    time: Number.isFinite(input.movingTimeSeconds) && input.movingTimeSeconds > 0,
    power: Number.isFinite(input.averagePowerWatts) && (input.averagePowerWatts ?? 0) > 0,
    heart_rate: Number.isFinite(input.averageHeartRateBpm) && (input.averageHeartRateBpm ?? 0) > 0,
    cadence: Number.isFinite(input.averageCadenceRpm) && (input.averageCadenceRpm ?? 0) > 0,
    distance: Number.isFinite(input.distanceMeters) && (input.distanceMeters ?? 0) > 0,
    elevation: Number.isFinite(input.elevationGainMeters) && (input.elevationGainMeters ?? 0) > 0,
  };

  const signals = (Object.keys(signalLabels) as DataSignal["id"][]).map((id): DataSignal => {
    if (hasStream(id)) return { id, label: signalLabels[id], status: "recorded_stream", recordCount: recordCount(id), detail: recordCount(id) === null ? "A recorded sample stream is stored, but its historical record count is unavailable." : `${recordCount(id)!.toLocaleString()} records were received for this signal.` };
    if (summaryValues[id]) return { id, label: signalLabels[id], status: "recorded_summary", recordCount: null, detail: "Ride-level summary available; no sample series was received." };
    return { id, label: signalLabels[id], status: "unavailable", recordCount: null, detail: "No usable records or ride-level value are stored." };
  });

  const recordedStreamCount = signals.filter((signal) => signal.status === "recorded_stream").length;
  const availableSignalCount = signals.filter((signal) => signal.status !== "unavailable").length;
  const power = signals.find((signal) => signal.id === "power")!;
  const heartRate = signals.find((signal) => signal.id === "heart_rate")!;
  const time = signals.find((signal) => signal.id === "time")!;
  const detailedCore = power.status === "recorded_stream" && heartRate.status === "recorded_stream" && time.status === "recorded_stream";
  const summaryCore = power.status !== "unavailable" && heartRate.status !== "unavailable" && time.status !== "unavailable";
  const partialCore = time.status !== "unavailable" && (power.status !== "unavailable" || heartRate.status !== "unavailable");

  let level: EvidenceLevel = detailedCore ? "high" : summaryCore || partialCore ? "moderate" : "low";
  if (input.storedDataQuality === "low") level = "low";
  if (level === "high" && (input.sampleCount ?? 0) < 60) level = "moderate";

  const limitations: string[] = [];
  if (!hasSamples || !availableStreams.length) limitations.push("Detailed stream inventory is unavailable; sample-based claims are withheld.");
  if (power.status !== "recorded_stream") limitations.push(power.status === "recorded_summary" ? "Power is summary-only, so power-duration and pacing claims require other detailed rides." : "Power evidence is unavailable.");
  if (heartRate.status !== "recorded_stream") limitations.push(heartRate.status === "recorded_summary" ? "Heart rate is summary-only, so durability analysis is unavailable." : "Heart-rate evidence is unavailable.");
  if (signals.find((signal) => signal.id === "cadence")!.status !== "recorded_stream") limitations.push("Cadence distribution is unavailable without a recorded cadence stream.");

  const normalizedPowerStatus: SignalStatus = input.normalizedPowerSource === "recorded"
    ? "recorded_summary"
    : input.normalizedPowerSource === "computed"
      ? "derived"
      : "unavailable";
  const intensityStatus = power.status === "unavailable"
    ? "unavailable" as const
    : input.intensityIsEstimated
      ? "estimated" as const
      : input.normalizedPowerSource === "computed"
        ? "computed_basis" as const
        : "recorded_basis" as const;
  const trainingLoadStatus = power.status === "unavailable"
    ? "unavailable" as const
    : input.trainingLoadIsEstimated
      ? "estimated" as const
      : input.normalizedPowerSource === "computed"
        ? "computed_basis" as const
        : "recorded_basis" as const;

  return {
    version: DATA_QUALITY_VERSION,
    level,
    label: level === "high" ? "Detailed evidence" : level === "moderate" ? "Partial evidence" : "Limited evidence",
    sourceLabel: sourceLabel(input.source, input.sourceFileType),
    sourceFilename: input.sourceFilename?.trim() || null,
    streamMode: hasSamples && availableStreams.length ? "detailed" : "summary_only",
    sampleCount: hasSamples ? Math.round(input.sampleCount!) : null,
    availableStreams,
    signals,
    recordedStreamCount,
    availableSignalCount,
    limitations,
    recommendationEligible: level !== "low" && summaryCore,
    metricsAlgorithmVersion: input.metricsAlgorithmVersion?.trim() || "legacy / unavailable",
    normalizedPowerStatus,
    intensityStatus,
    trainingLoadStatus,
  };
}

export function dataQualityRank(level: EvidenceLevel) {
  return level === "high" ? 3 : level === "moderate" ? 2 : 1;
}
