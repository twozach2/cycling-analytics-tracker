import assert from "node:assert/strict";
import test from "node:test";
import { buildCyclingMarkdown, cyclingMarkdownFilename, METHOD_DEFINITIONS, type MarkdownRide } from "../lib/markdown-export.ts";

const ride: MarkdownRide = {
  id: "ride-1",
  name: "Morning endurance",
  route: "Watopia · Tempus Fugit",
  date: "2026-08-07",
  type: "Zone 2",
  source: "Strava",
  indoor: true,
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
  intensityFactor: 0.81,
  powerHeartRateRatio: 0.97,
  decoupling: 3.2,
  variabilityIndex: 1.047,
  cadenceStddev: 4.1,
  cadenceTargetPercent: 65,
  cadenceAcceptablePercent: 91,
  cadenceLowPercent: 3,
  cadenceHighPercent: 1,
  first15HeartRate: 128,
  final15HeartRate: 137,
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
  assert.match(markdown, /Morning endurance/);
  assert.match(markdown, /Normalized power: 134 W/);
  assert.match(markdown, /Aerobic decoupling: 3\.2%/);
  assert.match(markdown, /Steady ride\. No pain\./);
  assert.equal(cyclingMarkdownFilename(new Date("2026-08-07T18:00:00.000Z")), "cycling-analytics-2026-08-07.md");
});

test("Markdown export labels unavailable optional ride metrics", () => {
  const markdown = buildCyclingMarkdown([{ ...ride, normalizedPower: null, decoupling: null }], {
    ftpWatts: 200,
    bodyWeightKg: 80,
    dataMode: "demo",
  });
  assert.match(markdown, /Data status: Fictional demo data/);
  assert.match(markdown, /Normalized power: Not available W/);
  assert.match(markdown, /Aerobic decoupling: Not available%/);
});
