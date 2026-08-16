export const LTHR_CANDIDATE_ALGORITHM_VERSION = "lthr-candidate-v1";

export type LthrConfidence = "low" | "moderate" | "high";

export type LthrCandidateInput = {
  rideId: string;
  rideName: string;
  startedAt: string;
  movingTimeSeconds: number;
  rideType: string;
  rideContext: string;
  ftpAtRideWatts: number | null;
  time: readonly number[];
  watts: readonly number[];
  heartRate: readonly number[];
};

export type LthrCandidate = {
  rideId: string;
  rideName: string;
  startedAt: string;
  lthrBpm: number;
  confidence: Exclude<LthrConfidence, "low">;
  algorithmVersion: typeof LTHR_CANDIDATE_ALGORITHM_VERSION;
  windowStartSeconds: number;
  windowEndSeconds: number;
  sampleCount: number;
  coveragePercent: number;
  averagePowerWatts: number;
  powerPercentFtp: number;
  powerVariationPercent: number;
  zeroPowerPercent: number;
  averageHeartRateBpm: number;
  minimumHeartRateBpm: number;
  maximumHeartRateBpm: number;
  heartRateChangeBpm: number;
  evidence: string[];
  limitations: string[];
};

type Sample = { time: number; watts: number; heartRate: number };

const mean = (values: readonly number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;

const standardDeviation = (values: readonly number[]) => {
  const average = mean(values);
  return Math.sqrt(values.reduce((sum, value) => sum + ((value - average) ** 2), 0) / values.length);
};

const round = (value: number, digits = 1) => {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
};

function windowEvidence(samples: readonly Sample[], start: number, durationSeconds: number) {
  const end = start + durationSeconds - 1;
  const window = samples.filter((sample) => sample.time >= start && sample.time <= end);
  if (window.length < durationSeconds * 0.95) return null;

  const powers = window.map((sample) => sample.watts);
  const heartRates = window.map((sample) => sample.heartRate);
  const firstFiveHeartRates = window.filter((sample) => sample.time < start + 300).map((sample) => sample.heartRate);
  const finalFiveHeartRates = window.filter((sample) => sample.time > end - 300).map((sample) => sample.heartRate);
  if (firstFiveHeartRates.length < 285 || finalFiveHeartRates.length < 285) return null;

  const powerBins: number[] = [];
  for (let binStart = start; binStart <= end; binStart += 30) {
    const values = window
      .filter((sample) => sample.time >= binStart && sample.time < Math.min(binStart + 30, end + 1))
      .map((sample) => sample.watts);
    if (values.length >= 27) powerBins.push(mean(values));
  }
  if (powerBins.length < 38) return null;

  const averagePowerWatts = mean(powers);
  const averageHeartRateBpm = mean(heartRates);
  return {
    start,
    end,
    sampleCount: window.length,
    coveragePercent: (window.length / durationSeconds) * 100,
    averagePowerWatts,
    rawPowerVariationPercent: averagePowerWatts > 0 ? (standardDeviation(powers) / averagePowerWatts) * 100 : 100,
    powerVariationPercent: averagePowerWatts > 0 ? (standardDeviation(powerBins) / averagePowerWatts) * 100 : 100,
    zeroPowerPercent: (powers.filter((value) => value === 0).length / powers.length) * 100,
    averageHeartRateBpm,
    minimumHeartRateBpm: Math.min(...heartRates),
    maximumHeartRateBpm: Math.max(...heartRates),
    heartRateChangeBpm: mean(finalFiveHeartRates) - mean(firstFiveHeartRates),
  };
}

/**
 * Finds a reviewable LTHR candidate from a sustained, threshold-like effort.
 * This intentionally withholds estimates from short, interrupted, highly variable,
 * or still-ramping efforts. It never mutates the rider's saved threshold.
 */
export function detectLthrCandidate(input: LthrCandidateInput): LthrCandidate | null {
  const ftp = input.ftpAtRideWatts;
  if (!Number.isFinite(ftp) || ftp === null || ftp < 50 || input.movingTimeSeconds < 25 * 60) return null;

  const samples: Sample[] = [];
  const count = Math.min(input.time.length, input.watts.length, input.heartRate.length);
  for (let index = 0; index < count; index += 1) {
    const time = input.time[index];
    const watts = input.watts[index];
    const heartRate = input.heartRate[index];
    if (!Number.isFinite(time) || !Number.isFinite(watts) || !Number.isFinite(heartRate)) continue;
    if (time < 0 || watts < 0 || heartRate < 60 || heartRate > 230) continue;
    samples.push({ time, watts, heartRate });
  }
  if (samples.length < 20 * 60) return null;
  samples.sort((left, right) => left.time - right.time);

  const firstTime = Math.ceil(samples[0].time);
  const finalTime = Math.floor(samples.at(-1)!.time);
  const windows = [] as Array<NonNullable<ReturnType<typeof windowEvidence>> & { powerPercentFtp: number; score: number }>;
  for (let start = firstTime; start + (20 * 60) - 1 <= finalTime; start += 5) {
    const evidence = windowEvidence(samples, start, 20 * 60);
    if (!evidence) continue;
    const powerPercentFtp = (evidence.averagePowerWatts / ftp) * 100;
    if (powerPercentFtp < 90 || powerPercentFtp > 115) continue;
    if (evidence.powerVariationPercent > 15 || evidence.rawPowerVariationPercent > 40 || evidence.zeroPowerPercent > 5) continue;
    if (evidence.heartRateChangeBpm < -5 || evidence.heartRateChangeBpm > 8) continue;
    const score = (
      100
      - Math.abs(powerPercentFtp - 100) * 0.8
      - evidence.powerVariationPercent * 0.5
      - Math.abs(evidence.heartRateChangeBpm) * 1.5
      + evidence.averageHeartRateBpm * 0.02
      + start * 0.0001
    );
    windows.push({ ...evidence, powerPercentFtp, score });
  }
  const best = windows.sort((left, right) => right.score - left.score)[0];
  if (!best) return null;

  const markedFieldTest = /ftp\s*test|threshold\s*test/i.test(input.rideType);
  const highConfidence = (
    input.movingTimeSeconds >= 30 * 60
    && markedFieldTest
    && best.coveragePercent >= 98
    && best.powerVariationPercent <= 10
    && best.zeroPowerPercent <= 1
    && best.heartRateChangeBpm >= -2
    && best.heartRateChangeBpm <= 6
  );
  const limitations: string[] = [];
  if (input.movingTimeSeconds < 30 * 60) limitations.push("The activity was shorter than the standard 30-minute field-test protocol.");
  if (!markedFieldTest) limitations.push("The activity was not explicitly recorded as a threshold field test.");
  if (best.powerVariationPercent > 10) limitations.push("Power varied more than a tightly controlled trainer test.");

  return {
    rideId: input.rideId,
    rideName: input.rideName,
    startedAt: input.startedAt,
    lthrBpm: Math.round(best.averageHeartRateBpm),
    confidence: highConfidence ? "high" : "moderate",
    algorithmVersion: LTHR_CANDIDATE_ALGORITHM_VERSION,
    windowStartSeconds: best.start,
    windowEndSeconds: best.end,
    sampleCount: best.sampleCount,
    coveragePercent: round(best.coveragePercent),
    averagePowerWatts: round(best.averagePowerWatts),
    powerPercentFtp: round(best.powerPercentFtp),
    powerVariationPercent: round(best.powerVariationPercent),
    zeroPowerPercent: round(best.zeroPowerPercent),
    averageHeartRateBpm: round(best.averageHeartRateBpm),
    minimumHeartRateBpm: Math.round(best.minimumHeartRateBpm),
    maximumHeartRateBpm: Math.round(best.maximumHeartRateBpm),
    heartRateChangeBpm: round(best.heartRateChangeBpm),
    evidence: [
      `20 continuous minutes at ${round(best.averagePowerWatts)} W (${round(best.powerPercentFtp)}% of ride-day FTP).`,
      `Heart rate averaged ${round(best.averageHeartRateBpm)} bpm and changed ${best.heartRateChangeBpm >= 0 ? "+" : ""}${round(best.heartRateChangeBpm)} bpm from the first to final five minutes.`,
      `${round(best.coveragePercent)}% sample coverage with ${round(best.zeroPowerPercent)}% zero-power time.`,
    ],
    limitations,
  };
}

export function rankLthrCandidates(candidates: readonly LthrCandidate[]) {
  return [...candidates].sort((left, right) => {
    const confidence = (right.confidence === "high" ? 2 : 1) - (left.confidence === "high" ? 2 : 1);
    if (confidence !== 0) return confidence;
    return Date.parse(right.startedAt) - Date.parse(left.startedAt);
  });
}
