import { round } from "./shared/math";

export type HeartRateZoneDistribution = {
  thresholdBpm: number;
  sampleCount: number;
  zone1Percent: number;
  zone2Percent: number;
  zone3Percent: number;
  zone4Percent: number;
  zone5Percent: number;
};

export type HeartRateZoneKey = "zone1Percent" | "zone2Percent" | "zone3Percent" | "zone4Percent" | "zone5Percent";

export const HEART_RATE_ZONES: ReadonlyArray<{
  key: HeartRateZoneKey;
  shortLabel: string;
  label: string;
  minimumRatio: number;
  maximumRatio: number | null;
}> = [
  { key: "zone1Percent", shortLabel: "Z1", label: "Easy", minimumRatio: 0, maximumRatio: 0.81 },
  { key: "zone2Percent", shortLabel: "Z2", label: "Aerobic", minimumRatio: 0.81, maximumRatio: 0.90 },
  { key: "zone3Percent", shortLabel: "Z3", label: "Tempo", minimumRatio: 0.90, maximumRatio: 0.94 },
  { key: "zone4Percent", shortLabel: "Z4", label: "Threshold", minimumRatio: 0.94, maximumRatio: 1 },
  { key: "zone5Percent", shortLabel: "Z5", label: "Above threshold", minimumRatio: 1, maximumRatio: null },
];

export function validLthr(value: number | null | undefined): value is number {
  return Number.isFinite(value) && value! >= 80 && value! <= 220;
}

export function deriveHeartRateZones(
  heartRates: readonly (number | null)[],
  lthrBpm: number | null | undefined,
): HeartRateZoneDistribution | null {
  if (!validLthr(lthrBpm)) return null;
  const valid = heartRates.filter((value): value is number => value !== null && Number.isFinite(value) && value > 0);
  if (!valid.length) return null;
  const counts = [0, 0, 0, 0, 0];
  for (const heartRate of valid) {
    const ratio = heartRate / lthrBpm;
    const index = ratio < 0.81 ? 0 : ratio < 0.90 ? 1 : ratio < 0.94 ? 2 : ratio < 1 ? 3 : 4;
    counts[index] += 1;
  }
  const percentages = counts.map((count) => round((count / valid.length) * 100));
  return {
    thresholdBpm: Math.round(lthrBpm),
    sampleCount: valid.length,
    zone1Percent: percentages[0],
    zone2Percent: percentages[1],
    zone3Percent: percentages[2],
    zone4Percent: percentages[3],
    zone5Percent: percentages[4],
  };
}

export function heartRateZoneRange(lthrBpm: number, zoneIndex: number): string {
  if (!validLthr(lthrBpm) || zoneIndex < 0 || zoneIndex > 4) return "Unavailable";
  const zone = HEART_RATE_ZONES[zoneIndex];
  const minimum = zoneIndex === 0 ? null : Math.ceil(zone.minimumRatio * lthrBpm);
  const maximum = zone.maximumRatio === null ? null : Math.ceil(zone.maximumRatio * lthrBpm) - 1;
  if (minimum === null) return `below ${maximum! + 1} bpm`;
  if (maximum === null) return `${minimum}+ bpm`;
  return `${minimum}–${maximum} bpm`;
}

export function aggregateHeartRateZones(
  distributions: readonly (HeartRateZoneDistribution | null | undefined)[],
): HeartRateZoneDistribution | null {
  const valid = distributions.filter((value): value is HeartRateZoneDistribution => Boolean(value?.sampleCount));
  if (!valid.length) return null;
  const sampleCount = valid.reduce((sum, value) => sum + value.sampleCount, 0);
  const weighted = (key: HeartRateZoneKey) => round(
    valid.reduce((sum, value) => sum + (value[key] * value.sampleCount), 0) / sampleCount,
  );
  return {
    thresholdBpm: valid.at(-1)!.thresholdBpm,
    sampleCount,
    zone1Percent: weighted("zone1Percent"),
    zone2Percent: weighted("zone2Percent"),
    zone3Percent: weighted("zone3Percent"),
    zone4Percent: weighted("zone4Percent"),
    zone5Percent: weighted("zone5Percent"),
  };
}

export function describeHeartRateDistribution(
  rideType: string,
  distribution: HeartRateZoneDistribution | null | undefined,
): { title: string; detail: string } {
  if (!distribution) {
    return {
      title: "Heart-rate zones unavailable",
      detail: "Save an LTHR and re-sync or re-import this ride to calculate its heart-rate distribution.",
    };
  }
  const easyShare = distribution.zone1Percent + distribution.zone2Percent;
  const tempoShare = distribution.zone3Percent + distribution.zone4Percent;
  const hardShare = distribution.zone4Percent + distribution.zone5Percent;
  if (/recovery|zone 2|endurance/i.test(rideType)) {
    return easyShare >= 65
      ? { title: "Mostly aerobic distribution", detail: `${easyShare.toFixed(0)}% of recorded heart-rate samples were in Z1–Z2, which is consistent with an easy aerobic emphasis.` }
      : { title: "A varied aerobic ride", detail: `${easyShare.toFixed(0)}% was in Z1–Z2. Hills, warm-up, heat, and natural pacing can all move heart rate above an endurance label.` };
  }
  if (/tempo|sweet spot/i.test(rideType)) {
    return tempoShare >= 30
      ? { title: "Sustained moderate-to-strong work", detail: `${tempoShare.toFixed(0)}% of samples were in Z3–Z4; heart rate naturally lags shorter efforts.` }
      : { title: "Mixed intensity distribution", detail: `${tempoShare.toFixed(0)}% was in Z3–Z4. The ride label summarizes intent; this chart describes what your heart rate recorded.` };
  }
  if (/threshold|vo2|sprint|ftp|race/i.test(rideType)) {
    return { title: "Higher-intensity context", detail: `${hardShare.toFixed(0)}% of samples were in Z4–Z5. Short efforts may be underrepresented because heart rate responds gradually.` };
  }
  return {
    title: "Descriptive, not a score",
    detail: "The distribution shows where your recorded heart rate spent time. It adds context without judging the ride or overriding its classification.",
  };
}

export function heartRateCueForMode(mode: "rest" | "recovery" | "endurance" | "tempo", lthrBpm: number | null | undefined) {
  if (!validLthr(lthrBpm)) return null;
  if (mode === "rest") return "No heart-rate target today";
  if (mode === "recovery") return `Mostly Z1 · ${heartRateZoneRange(lthrBpm, 0)}`;
  if (mode === "endurance") return `Mostly Z2 · ${heartRateZoneRange(lthrBpm, 1)} · brief Z3 hills are fine`;
  return `Comfortably strong Z3 · ${heartRateZoneRange(lthrBpm, 2)} · heart rate can lag`;
}
