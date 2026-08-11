import assert from "node:assert/strict";
import test from "node:test";
import { buildCoachReport } from "../lib/coach.ts";
import { assessRideDataQuality } from "../lib/data-quality.ts";
import { buildCyclingMarkdown, cyclingMarkdownFilename, cyclingRideMarkdownFilename, METHOD_DEFINITIONS, type MarkdownRide } from "../lib/markdown-export.ts";

const ride: MarkdownRide = {
  id: "ride-1",
  name: "Morning endurance",
  route: "Watopia · Tempus Fugit",
  date: "2026-08-07",
  type: "Zone 2",
  context: "benchmark",
  rideTypeSource: "automatic",
  rideContextSource: "automatic",
  classificationConfidence: "high",
  classificationReason: "The activity name explicitly identifies a controlled Zone 2 benchmark.",
  classificationVersion: "ride-classification-v2",
  source: "Strava",
  indoor: true,
  environment: "virtual",
  workoutSubtype: null,
  distanceMiles: 14.2,
  movingTimeSeconds: 3723,
  elevationFeet: 410,
  averagePower: 128,
  maximumPower: 304,
  normalizedPower: 134,
  averageHeartRate: 132,
  maximumHeartRate: 151,
  averageCadence: 87,
  maximumCadence: 102,
  trainingLoad: 54,
  intensityFactor: 0.67,
  ftpAtRideWatts: 165,
  ftpSnapshotSource: "ftp_history",
  powerHeartRateRatio: 0.97,
  decoupling: 3.2,
  decouplingEligible: true,
  decouplingEligibilityReason: "Eligible steady ride.",
  stoppedPercent: 1.2,
  variabilityIndex: 1.047,
  cadenceStddev: 4.1,
  cadenceTargetPercent: 65,
  cadenceAcceptablePercent: 91,
  cadenceLowPercent: 3,
  cadenceHighPercent: 1,
  first15HeartRate: 128,
  final15HeartRate: 137,
  dataQuality: assessRideDataQuality({
    source: "strava_export",
    sampleCount: 3723,
    availableStreams: ["time", "watts", "heartrate", "cadence", "distance", "altitude"],
    movingTimeSeconds: 3723,
    averagePowerWatts: 128,
    averageHeartRateBpm: 132,
    averageCadenceRpm: 87,
    distanceMeters: 14.2 * 1609.344,
    elevationGainMeters: 410 / 3.28084,
    normalizedPowerSource: "recorded",
    intensityIsEstimated: false,
    trainingLoadIsEstimated: false,
    storedDataQuality: "high",
    metricsAlgorithmVersion: "phase3.3",
  }),
  note: "Steady ride.\nNo pain.",
};

test("Markdown export contains rider configuration, methodology, and complete ride metrics", () => {
  const markdown = buildCyclingMarkdown([ride], {
    ftpWatts: 165,
    bodyWeightKg: 275 / 2.2046226218,
    dataMode: "saved",
  }, new Date("2026-08-07T18:00:00.000Z"));

  assert.match(markdown, /^# Cycling Analytics Export/m);
  assert.match(markdown, /FTP: 165 W/);
  assert.match(markdown, /Body weight: 275 lb/);
  assert.match(markdown, /## Method/);
  assert.match(markdown, new RegExp(METHOD_DEFINITIONS.at(-1)!.title));
  assert.match(markdown, /## Ride log/);
  assert.match(markdown, /Cadence distribution basis: Positive cadence samples only; zero-rpm coasting is excluded/);
  assert.match(markdown, /Rides: 1/);
  assert.match(markdown, /## Comparability audit/);
  assert.match(markdown, /Comparable route cohorts: 0/);
  assert.match(markdown, /Eligible controlled Zone 2 benchmarks: 1/);
  assert.match(markdown, /Benchmark trend ready: No/);
  assert.match(markdown, /Route comparison version: comparability-v1/);
  assert.match(markdown, /Zone 2 benchmark version: zone2-benchmark-v1/);
  assert.match(markdown, /Controlled Zone 2 benchmark: Eligible \(high confidence\)/);
  assert.match(markdown, /Morning endurance/);
  assert.match(markdown, /Normalized power: 134 W/);
  assert.match(markdown, /Aerobic decoupling: 3\.2%/);
  assert.match(markdown, /Environment: Virtual \/ Indoor/);
  assert.match(markdown, /Context: Controlled benchmark/);
  assert.match(markdown, /Classification confidence: high/);
  assert.match(markdown, /Classification evidence: The activity name explicitly identifies/);
  assert.match(markdown, /Classification version: ride-classification-v2/);
  assert.match(markdown, /FTP at ride: 165 W/);
  assert.match(markdown, /Data quality: high/);
  assert.match(markdown, /Detailed signals: 6\/6/);
  assert.match(markdown, /Steady ride\. No pain\./);
  assert.equal(cyclingMarkdownFilename(new Date("2026-08-07T18:00:00.000Z")), "cycling-analytics-2026-08-07.md");
  assert.equal(cyclingRideMarkdownFilename(ride), "cycling-analytics-2026-08-07-morning-endurance.md");
});

test("Markdown export labels unavailable optional ride metrics", () => {
  const markdown = buildCyclingMarkdown([{ ...ride, normalizedPower: null, decoupling: -11.2, decouplingEligible: false, decouplingEligibilityReason: "Warm-up dominated." }], {
    ftpWatts: 200,
    bodyWeightKg: 80,
    dataMode: "demo",
  });
  assert.match(markdown, /Data status: Fictional demo data/);
  assert.match(markdown, /Normalized power: Not available W/);
  assert.match(markdown, /Aerobic decoupling: Not suitable for interpretation/);
  assert.match(markdown, /Not eligible — Warm-up dominated/);
});
test("Markdown export includes an auditable Coach Mode snapshot", () => {
  const coachReport = buildCoachReport({
    rides: [{
      id: ride.id,
      name: ride.name,
      date: "2026-08-07T12:00:00.000Z",
      trainingType: ride.type,
      context: ride.context!,
      environment: ride.environment!,
      movingTimeSeconds: ride.movingTimeSeconds,
      trainingLoad: ride.trainingLoad,
      intensityFactor: ride.intensityFactor,
      averagePower: ride.averagePower,
      averageHeartRate: ride.averageHeartRate,
      powerHeartRateRatio: ride.powerHeartRateRatio,
      classificationConfidence: ride.classificationConfidence!,
      dataQualityLevel: ride.dataQuality!.level,
    }],
    readinessScore: 72,
    subjective: { bodyCondition: "normal", sleepQuality: 4, legFreshness: "normal", motivation: 4 },
    checkInRecorded: true,
    referenceDate: "2026-08-10T12:00:00.000Z",
  });
  const markdown = buildCyclingMarkdown([ride], {
    ftpWatts: 165,
    bodyWeightKg: 275 / 2.2046226218,
    dataMode: "saved",
    coachReport,
  }, new Date("2026-08-10T12:00:00.000Z"));

  assert.match(markdown, /## Coach Mode snapshot/);
  assert.match(markdown, /Algorithm: coach-v2/);
  assert.match(markdown, /Recommendation:/);
  assert.match(markdown, /Caution: The 28-day weekly load baseline is not stable yet\./);
  assert.match(markdown, /Seven-day load:/);
  assert.match(markdown, /Pre-ride plan \(inferred\):/);
  assert.match(markdown, /Completed-ride match:/);
});
