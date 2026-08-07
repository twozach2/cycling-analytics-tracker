export type DetectedActivity = {
  name: string;
  startedAt: string;
  distanceMeters: number | null;
  movingTimeSeconds: number | null;
  elevationGainMeters: number | null;
  averageHeartRate: number | null;
  maximumHeartRate: number | null;
  averageCadence: number | null;
  maximumCadence: number | null;
  averagePower: number | null;
  maximumPower: number | null;
  normalizedPower: number | null;
  sourceTrainingLoad: number | null;
  aerobicDecouplingPercent: number | null;
  variabilityIndex: number | null;
  cadenceStddev: number | null;
  cadenceTargetPercent: number | null;
  cadenceAcceptablePercent: number | null;
  cadenceLowPercent: number | null;
  cadenceHighPercent: number | null;
  first15HeartRate: number | null;
  final15HeartRate: number | null;
  sampleCount: number;
  warnings: string[];
};

type Sample = {
  time: number | null;
  latitude: number | null;
  longitude: number | null;
  elevation: number | null;
  heartRate: number | null;
  cadence: number | null;
  power: number | null;
  distance: number | null;
};

const numberOrNull = (value: string | null | undefined) => {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const textByLocalName = (element: Element, names: string[]) => {
  const match = Array.from(element.getElementsByTagName("*")).find((candidate) =>
    names.includes(candidate.localName.toLowerCase()),
  );
  return match?.textContent?.trim() ?? null;
};

const average = (values: Array<number | null>) => {
  const valid = values.filter((value): value is number => value !== null && value > 0);
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null;
};

const maximum = (values: Array<number | null>) => {
  const valid = values.filter((value): value is number => value !== null);
  return valid.length ? Math.max(...valid) : null;
};

const round = (value: number, digits = 1) => {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
};

function streamMetrics(samples: Sample[]) {
  const cadence = samples.map((sample) => sample.cadence).filter((value): value is number => value !== null && value > 0);
  const cadenceMean = cadence.length ? cadence.reduce((sum, value) => sum + value, 0) / cadence.length : null;
  const cadenceStddev = cadenceMean === null ? null : Math.sqrt(cadence.reduce((sum, value) => sum + ((value - cadenceMean) ** 2), 0) / cadence.length);
  const cadencePercent = (predicate: (value: number) => boolean) => cadence.length
    ? round((cadence.filter(predicate).length / cadence.length) * 100)
    : null;

  const paired = samples.filter((sample) => sample.power !== null && sample.power > 0 && sample.heartRate !== null && sample.heartRate > 0);
  const pairedPower = paired.map((sample) => sample.power!);
  const pairedPowerMean = pairedPower.length ? pairedPower.reduce((sum, value) => sum + value, 0) / pairedPower.length : null;
  const powerStddev = pairedPowerMean === null ? null : Math.sqrt(pairedPower.reduce((sum, value) => sum + ((value - pairedPowerMean) ** 2), 0) / pairedPower.length);
  const sufficientlySteady = pairedPowerMean !== null && powerStddev !== null && powerStddev / pairedPowerMean <= 0.25;
  let aerobicDecouplingPercent: number | null = null;
  if (paired.length >= 20 && sufficientlySteady) {
    const midpoint = Math.floor(paired.length / 2);
    const efficiency = (values: Sample[]) => {
      const power = average(values.map((sample) => sample.power));
      const heartRate = average(values.map((sample) => sample.heartRate));
      return power !== null && heartRate !== null && heartRate > 0 ? power / heartRate : null;
    };
    const first = efficiency(paired.slice(0, midpoint));
    const second = efficiency(paired.slice(midpoint));
    if (first !== null && second !== null && first > 0) aerobicDecouplingPercent = round(((first - second) / first) * 100);
  }

  const timedHeartRate = samples.filter((sample) => sample.time !== null && sample.heartRate !== null && sample.heartRate > 0);
  const firstTime = timedHeartRate.at(0)?.time ?? null;
  const lastTime = timedHeartRate.at(-1)?.time ?? null;
  const first15HeartRate = firstTime === null ? null : average(timedHeartRate.filter((sample) => sample.time! <= firstTime + (15 * 60 * 1000)).map((sample) => sample.heartRate));
  const final15HeartRate = lastTime === null ? null : average(timedHeartRate.filter((sample) => sample.time! >= lastTime - (15 * 60 * 1000)).map((sample) => sample.heartRate));

  return {
    aerobicDecouplingPercent,
    cadenceStddev: cadenceStddev === null ? null : round(cadenceStddev),
    cadenceTargetPercent: cadencePercent((value) => value >= 85 && value <= 90),
    cadenceAcceptablePercent: cadencePercent((value) => value >= 80 && value <= 95),
    cadenceLowPercent: cadencePercent((value) => value < 75),
    cadenceHighPercent: cadencePercent((value) => value > 100),
    first15HeartRate: first15HeartRate === null ? null : round(first15HeartRate),
    final15HeartRate: final15HeartRate === null ? null : round(final15HeartRate),
  };
}

const haversineMeters = (a: Sample, b: Sample) => {
  if (
    a.latitude === null ||
    a.longitude === null ||
    b.latitude === null ||
    b.longitude === null
  ) return 0;
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const earthRadius = 6_371_000;
  const dLat = radians(b.latitude - a.latitude);
  const dLon = radians(b.longitude - a.longitude);
  const lat1 = radians(a.latitude);
  const lat2 = radians(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};

export function parseXmlActivity(xmlText: string, filename: string): DetectedActivity {
  const document = new DOMParser().parseFromString(xmlText, "application/xml");
  if (document.querySelector("parsererror")) throw new Error("This XML file could not be read.");

  const trackpoints = Array.from(document.getElementsByTagName("*")).filter((element) =>
    ["trkpt", "trackpoint"].includes(element.localName.toLowerCase()),
  );
  if (!trackpoints.length) throw new Error("No timed track points were found in this file.");

  const samples: Sample[] = trackpoints.map((point) => {
    const latitude =
      numberOrNull(point.getAttribute("lat")) ??
      numberOrNull(textByLocalName(point, ["latitudedegrees"]));
    const longitude =
      numberOrNull(point.getAttribute("lon")) ??
      numberOrNull(textByLocalName(point, ["longitudedegrees"]));
    const timestamp = textByLocalName(point, ["time"]);
    return {
      time: timestamp ? Date.parse(timestamp) : null,
      latitude,
      longitude,
      elevation: numberOrNull(textByLocalName(point, ["ele", "altitudemeters"])),
      heartRate: numberOrNull(textByLocalName(point, ["hr", "heartratebpm", "value"])),
      cadence: numberOrNull(textByLocalName(point, ["cad", "cadence", "runcadence"])),
      power: numberOrNull(textByLocalName(point, ["power", "watts"])),
      distance: numberOrNull(textByLocalName(point, ["distancemeters"])),
    };
  });

  const timedSamples = samples.filter((sample) => sample.time !== null);
  const firstTime = timedSamples.at(0)?.time ?? null;
  const lastTime = timedSamples.at(-1)?.time ?? null;
  const duration = firstTime !== null && lastTime !== null ? (lastTime - firstTime) / 1000 : null;

  const recordedDistances = samples.map((sample) => sample.distance).filter((value): value is number => value !== null);
  let distance = recordedDistances.length ? Math.max(...recordedDistances) : 0;
  if (!distance) {
    distance = samples.slice(1).reduce((sum, sample, index) => sum + haversineMeters(samples[index], sample), 0);
  }

  let elevationGain = 0;
  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1].elevation;
    const current = samples[index].elevation;
    if (previous !== null && current !== null && current > previous) elevationGain += current - previous;
  }

  const warnings: string[] = [];
  if (!samples.some((sample) => sample.power !== null)) warnings.push("No recorded power stream");
  if (!samples.some((sample) => sample.heartRate !== null)) warnings.push("No heart-rate stream");
  if (!samples.some((sample) => sample.cadence !== null)) warnings.push("No cadence stream");
  if (!distance) warnings.push("Distance could not be detected");

  const fileBase = filename.replace(/\.(gpx|tcx)$/i, "").replace(/[_-]+/g, " ");
  const streams = streamMetrics(samples);
  return {
    name: fileBase || "Imported ride",
    startedAt: firstTime !== null ? new Date(firstTime).toISOString() : "",
    distanceMeters: distance || null,
    movingTimeSeconds: duration,
    elevationGainMeters: elevationGain || null,
    averageHeartRate: average(samples.map((sample) => sample.heartRate)),
    maximumHeartRate: maximum(samples.map((sample) => sample.heartRate)),
    averageCadence: average(samples.map((sample) => sample.cadence)),
    maximumCadence: maximum(samples.map((sample) => sample.cadence)),
    averagePower: average(samples.map((sample) => sample.power)),
    maximumPower: maximum(samples.map((sample) => sample.power)),
    normalizedPower: null,
    sourceTrainingLoad: null,
    ...streams,
    variabilityIndex: null,
    sampleCount: samples.length,
    warnings,
  };
}

const fitNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const fitDate = (value: unknown) => {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value;
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    if (Number.isFinite(parsed.getTime())) return parsed;
  }
  return null;
};

export async function parseFitActivity(buffer: ArrayBuffer, filename: string): Promise<DetectedActivity> {
  const { Decoder, Stream } = await import("@garmin/fitsdk");
  const validationStream = Stream.fromArrayBuffer(buffer);
  if (!Decoder.isFIT(validationStream)) throw new Error("This file does not contain a valid FIT header.");

  const integrityPassed = new Decoder(Stream.fromArrayBuffer(buffer)).checkIntegrity();
  const decoder = new Decoder(Stream.fromArrayBuffer(buffer));
  const { messages, errors } = decoder.read({
    applyScaleAndOffset: true,
    expandComponents: true,
    expandSubFields: true,
    convertDateTimesToDates: true,
    mergeHeartRates: true,
  });
  const session = messages.sessionMesgs?.[0];
  const records = messages.recordMesgs ?? [];
  if (!session && !records.length) throw new Error("No cycling session or activity records were found in this FIT file.");

  const firstRecordTime = fitDate(records.at(0)?.timestamp);
  const lastRecordTime = fitDate(records.at(-1)?.timestamp);
  const startedAt = fitDate(session?.startTime) ?? firstRecordTime;
  const recordDuration = firstRecordTime && lastRecordTime
    ? Math.max(0, (lastRecordTime.getTime() - firstRecordTime.getTime()) / 1000)
    : null;
  const recordDistances = records.map((record) => fitNumber(record.distance)).filter((value): value is number => value !== null);
  const powerValues = records.map((record) => fitNumber(record.power));
  const heartRateValues = records.map((record) => fitNumber(record.heartRate));
  const cadenceValues = records.map((record) => fitNumber(record.cadence));
  const recordSamples: Sample[] = records.map((record) => ({
    time: fitDate(record.timestamp)?.getTime() ?? null,
    latitude: null,
    longitude: null,
    elevation: fitNumber(record.altitude),
    heartRate: fitNumber(record.heartRate),
    cadence: fitNumber(record.cadence),
    power: fitNumber(record.power),
    distance: fitNumber(record.distance),
  }));
  let calculatedElevationGain = 0;
  for (let index = 1; index < records.length; index += 1) {
    const previous = fitNumber(records[index - 1].altitude);
    const current = fitNumber(records[index].altitude);
    if (previous !== null && current !== null && current > previous) calculatedElevationGain += current - previous;
  }

  const warnings: string[] = [];
  if (!integrityPassed) warnings.push("FIT integrity check did not pass; review detected values");
  if (errors.length) warnings.push(`${errors.length} decoder warning${errors.length === 1 ? "" : "s"}`);
  if (!powerValues.some((value) => value !== null)) warnings.push("No recorded power stream");
  if (!heartRateValues.some((value) => value !== null)) warnings.push("No heart-rate stream");
  if (!cadenceValues.some((value) => value !== null)) warnings.push("No cadence stream");

  const fileBase = filename.replace(/\.fit$/i, "").replace(/[_-]+/g, " ");
  const averagePower = fitNumber(session?.avgPower) ?? average(powerValues);
  const normalizedPower = fitNumber(session?.normalizedPower);
  const streams = streamMetrics(recordSamples);
  return {
    name: fileBase || "Imported FIT ride",
    startedAt: startedAt?.toISOString() ?? "",
    distanceMeters: fitNumber(session?.totalDistance) ?? (recordDistances.length ? Math.max(...recordDistances) : null),
    movingTimeSeconds: fitNumber(session?.totalTimerTime) ?? fitNumber(session?.totalMovingTime) ?? recordDuration,
    elevationGainMeters: fitNumber(session?.totalAscent) ?? (calculatedElevationGain || null),
    averageHeartRate: fitNumber(session?.avgHeartRate) ?? average(heartRateValues),
    maximumHeartRate: fitNumber(session?.maxHeartRate) ?? maximum(heartRateValues),
    averageCadence: fitNumber(session?.avgCadence) ?? average(cadenceValues),
    maximumCadence: fitNumber(session?.maxCadence) ?? maximum(cadenceValues),
    averagePower,
    maximumPower: fitNumber(session?.maxPower) ?? maximum(powerValues),
    normalizedPower,
    sourceTrainingLoad: fitNumber(session?.trainingStressScore),
    ...streams,
    variabilityIndex: normalizedPower !== null && averagePower !== null && averagePower > 0 ? round(normalizedPower / averagePower, 2) : null,
    sampleCount: records.length,
    warnings,
  };
}

export async function parseActivityFile(file: File): Promise<DetectedActivity> {
  const extension = file.name.split(".").at(-1)?.toLowerCase();
  if (extension === "fit") return parseFitActivity(await file.arrayBuffer(), file.name);
  if (extension === "gpx" || extension === "tcx") return parseXmlActivity(await file.text(), file.name);
  throw new Error("Choose an original FIT file, TCX export, or GPX activity file.");
}
