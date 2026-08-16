export type StreamRecordCounts = Record<string, number>;

type StreamSetLike = Record<string, { data?: readonly unknown[] } | undefined>;

type ActivitySampleLike = {
  time?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  elevation?: number | null;
  heartRate?: number | null;
  cadence?: number | null;
  power?: number | null;
  distance?: number | null;
};

const validCount = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0
  ? Math.round(value)
  : 0;

export function normalizeStreamRecordCounts(value: unknown): StreamRecordCounts {
  let candidate = value;
  if (typeof value === "string") {
    try {
      candidate = JSON.parse(value) as unknown;
    } catch {
      return {};
    }
  }
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return {};
  return Object.fromEntries(Object.entries(candidate)
    .map(([key, count]) => [key.trim().toLowerCase(), validCount(count)] as const)
    .filter(([key, count]) => Boolean(key) && count > 0));
}

export function countStravaStreamRecords(streams: StreamSetLike): StreamRecordCounts {
  return Object.fromEntries(Object.entries(streams)
    .map(([key, stream]) => [key.trim().toLowerCase(), stream?.data?.length ?? 0] as const)
    .filter(([key, count]) => Boolean(key) && count > 0));
}

export function countActivitySampleRecords(samples: readonly ActivitySampleLike[]): StreamRecordCounts {
  const count = (predicate: (sample: ActivitySampleLike) => boolean) => samples.reduce((total, sample) => total + (predicate(sample) ? 1 : 0), 0);
  return normalizeStreamRecordCounts({
    time: count((sample) => Number.isFinite(sample.time)),
    latlng: count((sample) => Number.isFinite(sample.latitude) && Number.isFinite(sample.longitude)),
    altitude: count((sample) => Number.isFinite(sample.elevation)),
    heartrate: count((sample) => Number.isFinite(sample.heartRate)),
    cadence: count((sample) => Number.isFinite(sample.cadence)),
    watts: count((sample) => Number.isFinite(sample.power)),
    distance: count((sample) => Number.isFinite(sample.distance)),
  });
}
