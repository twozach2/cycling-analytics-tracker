import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import test from "node:test";
import { derivePowerDuration, deriveStreamMetrics, type ActivitySample } from "../lib/activity-parser.ts";
import { buildCyclingVo2Trend, buildPowerRecordHistory, buildWeeklyPlan, estimateCyclingVo2Max, predictFtp, projectFtpGoal, recommendWorkout } from "../lib/phase3.ts";
import { estimateZwiftRouteTime, recommendZwiftRoutes, ROUTE_TIME_WINDOWS, ZWIFT_ROUTE_CATALOG, ZWIFT_ROUTE_COUNT, ZWIFT_WORLDS } from "../lib/zwift-routes.ts";
import { fallbackGuestWorlds, parseGuestWorldsFromSchedule } from "../lib/zwift-world-rotation.ts";

test("derives rolling power evidence from timestamped samples", () => {
  const samples: ActivitySample[] = Array.from({ length: 1201 }, (_, second) => ({
    time: second * 1000,
    power: 200,
    heartRate: 140,
    cadence: 88,
    distance: second * 8,
    elevation: null,
    latitude: null,
    longitude: null,
  }));
  const bests = derivePowerDuration(samples);
  assert.equal(bests.find((best) => best.durationSeconds === 1200)?.bestPowerWatts, 200);
});

test("power-duration uses elapsed time for irregular samples", () => {
  const samples: ActivitySample[] = [0, 1000, 2100, 3500, 5000].map((time) => ({
    time,
    power: 215,
    heartRate: null,
    cadence: null,
    distance: null,
    elevation: null,
    latitude: null,
    longitude: null,
  }));
  assert.equal(derivePowerDuration(samples).find((best) => best.durationSeconds === 5)?.bestPowerWatts, 215);
});

test("power-duration rejects pauses and trainer dropouts", () => {
  const block = (startSecond: number) => Array.from({ length: 241 }, (_, offset) => ({
    time: (startSecond + offset) * 1000,
    power: 400,
    heartRate: null,
    cadence: null,
    distance: null,
    elevation: null,
    latitude: null,
    longitude: null,
  } satisfies ActivitySample));
  const bests = derivePowerDuration([...block(0), ...block(600)]);
  assert.equal(bests.some((best) => best.durationSeconds === 300), false);
  assert.equal(bests.find((best) => best.durationSeconds === 120)?.bestPowerWatts, 400);
});

test("power-duration counts continuous zero-power time and ignores duplicate timestamps", () => {
  const samples: ActivitySample[] = Array.from({ length: 121 }, (_, second) => ({
    time: second * 1000,
    power: second < 60 ? 200 : 0,
    heartRate: null,
    cadence: null,
    distance: null,
    elevation: null,
    latitude: null,
    longitude: null,
  }));
  samples.push({ ...samples[0], power: 200 });
  const bests = derivePowerDuration(samples);
  assert.equal(bests.find((best) => best.durationSeconds === 120)?.bestPowerWatts, 100);
});

test("power-duration includes ten, fifteen, and ninety minute targets", () => {
  const samples: ActivitySample[] = Array.from({ length: 5401 }, (_, second) => ({
    time: second * 1000,
    power: 180,
    heartRate: null,
    cadence: null,
    distance: null,
    elevation: null,
    latitude: null,
    longitude: null,
  }));
  const durations = derivePowerDuration(samples).map((best) => best.durationSeconds);
  assert.ok(durations.includes(600));
  assert.ok(durations.includes(900));
  assert.ok(durations.includes(5400));
});

test("builds all-time, recent, and previous power records with a PR timeline", () => {
  const history = buildPowerRecordHistory([
    { rideId: "a", rideName: "Baseline", startedAt: "2026-01-01T12:00:00Z", durationSeconds: 300, bestPowerWatts: 200 },
    { rideId: "b", rideName: "January build", startedAt: "2026-01-10T12:00:00Z", durationSeconds: 300, bestPowerWatts: 210 },
    { rideId: "c", rideName: "Not a record", startedAt: "2026-02-01T12:00:00Z", durationSeconds: 300, bestPowerWatts: 205 },
    { rideId: "d", rideName: "April peak", startedAt: "2026-04-01T12:00:00Z", durationSeconds: 300, bestPowerWatts: 220 },
  ], Date.parse("2026-04-10T12:00:00Z"));
  const fiveMinute = history.records.find((record) => record.durationSeconds === 300)!;
  assert.equal(fiveMinute.allTime.rideName, "April peak");
  assert.equal(fiveMinute.previousRecord?.bestPowerWatts, 210);
  assert.equal(fiveMinute.improvementWatts, 10);
  assert.equal(fiveMinute.improvementPercent, 4.8);
  assert.equal(fiveMinute.best30Days?.bestPowerWatts, 220);
  assert.equal(fiveMinute.best42Days?.bestPowerWatts, 220);
  assert.equal(fiveMinute.recordCount, 3);
  assert.equal(history.algorithmVersion, "power-duration-v3");
  assert.deepEqual(history.curves.map((curve) => curve.window), ["all_time", "42_days", "90_days"]);
  assert.equal(history.curves.find((curve) => curve.window === "42_days")?.points[0]?.effort.bestPowerWatts, 220);
  assert.equal(history.curves.find((curve) => curve.window === "90_days")?.points[0]?.effort.bestPowerWatts, 220);
  assert.equal(history.timeline.length, 3);
});

test("derives interval-smoothed durability from a variable ride", () => {
  const samples: ActivitySample[] = Array.from({ length: 1200 }, (_, second) => ({
    time: second * 1000,
    power: second % 2 === 0 ? 80 : 220,
    heartRate: second < 600 ? 140 : 150,
    cadence: 88,
    distance: second * 8,
    elevation: null,
    latitude: null,
    longitude: null,
  }));
  const metrics = deriveStreamMetrics(samples);
  assert.equal(metrics.aerobicDecouplingPercent, 6.7);
});

test("computes normalized power and VI from a detailed power stream", () => {
  const samples: ActivitySample[] = Array.from({ length: 600 }, (_, second) => ({
    time: second * 1000,
    power: Math.floor(second / 60) % 2 === 0 ? 100 : 200,
    heartRate: 140,
    cadence: 88,
    distance: second * 8,
    elevation: null,
    latitude: null,
    longitude: null,
  }));
  const metrics = deriveStreamMetrics(samples);
  assert.ok(metrics.averagePower! >= 149 && metrics.averagePower! <= 151);
  assert.ok(metrics.normalizedPower! > metrics.averagePower!);
  assert.ok(metrics.variabilityIndex! > 1.05);
});

test("normalized power does not bridge pauses or power-stream dropouts", () => {
  const sample = (time: number, power: number): ActivitySample => ({
    time,
    power,
    heartRate: 140,
    cadence: 88,
    distance: null,
    elevation: null,
    latitude: null,
    longitude: null,
  });
  const samples = [
    ...Array.from({ length: 90 }, (_, second) => sample(second * 1000, 100)),
    ...Array.from({ length: 90 }, (_, second) => sample((150 + second) * 1000, 200)),
  ];
  const metrics = deriveStreamMetrics(samples);
  assert.equal(metrics.averagePower, 150);
  assert.ok(metrics.normalizedPower! >= 170 && metrics.normalizedPower! <= 171);
  assert.ok(metrics.variabilityIndex! >= 1.13 && metrics.variabilityIndex! <= 1.15);
});

test("withholds normalized power when a continuous 30-second window is unavailable", () => {
  const samples: ActivitySample[] = Array.from({ length: 20 }, (_, second) => ({
    time: second * 1000,
    power: 150,
    heartRate: null,
    cadence: null,
    distance: null,
    elevation: null,
    latitude: null,
    longitude: null,
  }));
  const metrics = deriveStreamMetrics(samples);
  assert.equal(metrics.averagePower, 150);
  assert.equal(metrics.normalizedPower, null);
  assert.equal(metrics.variabilityIndex, null);
});
test("requires enough paired intervals for durability", () => {
  const samples: ActivitySample[] = Array.from({ length: 20 }, (_, second) => ({
    time: second * 1000,
    power: 150,
    heartRate: 140,
    cadence: null,
    distance: null,
    elevation: null,
    latitude: null,
    longitude: null,
  }));
  assert.equal(deriveStreamMetrics(samples).aerobicDecouplingPercent, null);
});

test("FTP prediction returns a range and evidence rather than false precision", () => {
  const prediction = predictFtp([
    { durationSeconds: 1200, bestPowerWatts: 176 },
    { durationSeconds: 1800, bestPowerWatts: 171 },
    { durationSeconds: 3600, bestPowerWatts: 164 },
  ], 165);
  assert.equal(prediction.confidence, "high");
  assert.ok(prediction.minimumWatts! < prediction.maximumWatts!);
  assert.ok(prediction.signals.some((signal) => signal.includes("20m best")));
});

test("estimates cycling VO2 max from five-minute relative power", () => {
  assert.equal(estimateCyclingVo2Max(250, 80), 44.3);
  assert.equal(estimateCyclingVo2Max(0, 80), null);
});

test("tracks VO2 improvement using comparable rolling 90-day peaks", () => {
  const trend = buildCyclingVo2Trend([
    { startedAt: "2026-01-01T12:00:00Z", fiveMinutePowerWatts: 190, weightKg: 100 },
    { startedAt: "2026-02-01T12:00:00Z", fiveMinutePowerWatts: 195, weightKg: 100 },
    { startedAt: "2026-04-15T12:00:00Z", fiveMinutePowerWatts: 215, weightKg: 98 },
    { startedAt: "2026-05-15T12:00:00Z", fiveMinutePowerWatts: 220, weightKg: 98 },
  ], 180);
  assert.equal(trend.status, "trend_ready");
  assert.equal(trend.estimateMlKgMin, 36.5);
  assert.ok(trend.changePercent! > 0);
  assert.equal(trend.points.length, 4);
});

test("goal projection presents three scenarios", () => {
  const projection = projectFtpGoal(165, 200, "2026-08-07");
  assert.ok(projection.aggressiveDate! < projection.currentTrendDate!);
  assert.ok(projection.currentTrendDate! < projection.conservativeDate!);
  assert.match(projection.disclaimer, /not a promise/i);
});

test("pain concerns make workout guidance and the generated week appropriately cautious", () => {
  const moderateConcern = { readinessScore: 54, painConcernSeverity: 3, trainingLoadRatio: 1, recentHardSessions: 0 };
  const substantialConcern = { ...moderateConcern, readinessScore: 39, painConcernSeverity: 5 };
  assert.equal(recommendWorkout(moderateConcern).mode, "recovery");
  assert.match(recommendWorkout(moderateConcern).primary, /pain-free recovery spin/);
  assert.equal(recommendWorkout(substantialConcern).mode, "rest");
  assert.equal(buildWeeklyPlan(substantialConcern, "2026-08-10")[0].session, "Rest or pain-free movement");
});

test("weekly plan starts today and advances through real calendar dates", () => {
  const input = { readinessScore: 80, painConcernSeverity: 0, trainingLoadRatio: 1, recentHardSessions: 0 };
  const plan = buildWeeklyPlan(input, "2026-08-08");
  assert.deepEqual(plan.map((day) => day.day), ["Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri"]);
  assert.deepEqual(plan.map((day) => day.dateIso), ["2026-08-08", "2026-08-09", "2026-08-10", "2026-08-11", "2026-08-12", "2026-08-13", "2026-08-14"]);
  assert.equal(plan[0].session, recommendWorkout(input).primary);
});

test("Zwift route suite uses the requested time windows and FTP-based targets", () => {
  const suite = recommendZwiftRoutes("tempo", 165, 275 / 2.2046226218);
  assert.deepEqual(suite.map((suggestion) => suggestion.commitment), [30, 60, 90]);
  assert.equal(new Set(suite.map((suggestion) => suggestion.route.id)).size, 3);
  assert.deepEqual(suite.map((suggestion) => suggestion.targetWatts), ["125–145 W", "125–145 W", "125–145 W"]);
  assert.equal(suite.find((suggestion) => suggestion.recommended)?.commitment, 60);
  assert.ok(suite.every((suggestion) => suggestion.focus === "Tempo exploration"));
  assert.ok(suite.every((suggestion) => suggestion.rideCue.includes("comfortably strong tempo stretches")));
  assert.ok(suite.every((suggestion) => suggestion.optionalStretch.includes("Skipping it is equally valid")));
  assert.ok(suite.every((suggestion) => suggestion.encouragement.includes("not an assignment")));
  assert.ok(suite.every((suggestion) => suggestion.timingCue.includes("125–145 W")));
  assert.equal(ZWIFT_ROUTE_COUNT, 75);
  assert.ok(suite.every((suggestion) => (
    suggestion.estimatedMinutes >= ROUTE_TIME_WINDOWS[suggestion.commitment].minimumMinutes
      && suggestion.estimatedMinutes <= ROUTE_TIME_WINDOWS[suggestion.commitment].maximumMinutes
  )));
});

test("Zwift route timing uses the suggested mode's FTP range", () => {
  const laReine = ZWIFT_ROUTE_CATALOG.find((route) => route.id === "france-la-reine")!;
  const endurance = estimateZwiftRouteTime(laReine, 165, 275 / 2.2046226218, "endurance");
  const tempo = estimateZwiftRouteTime(laReine, 165, 275 / 2.2046226218, "tempo");
  const recovery = estimateZwiftRouteTime(laReine, 165, 275 / 2.2046226218, "recovery");
  assert.equal(endurance.minimumPowerWatts, 99);
  assert.equal(endurance.maximumPowerWatts, 119);
  assert.equal(tempo.minimumPowerWatts, 125);
  assert.equal(tempo.maximumPowerWatts, 145);
  assert.ok(recovery.midpointMinutes > endurance.midpointMinutes);
  assert.ok(endurance.midpointMinutes > tempo.midpointMinutes);
  assert.ok(endurance.minimumMinutes > 180);
  assert.ok(endurance.maximumMinutes > endurance.minimumMinutes);
  assert.throws(() => estimateZwiftRouteTime(laReine, Number.NaN, 80), /saved FTP/i);
  assert.throws(() => estimateZwiftRouteTime(laReine, 200, Number.NaN), /saved body weight/i);
});

test("Zwift route suite can be limited to a supplied world pool", () => {
  const suite = recommendZwiftRoutes("endurance", 200, 80, ["Watopia", "Paris", "France"]);
  assert.ok(suite.every((suggestion) => ["Watopia", "Paris", "France"].includes(suggestion.route.world)));
  assert.ok(suite.every((suggestion) => suggestion.reason.includes("change of scenery")));
  assert.ok(suite.every((suggestion) => suggestion.focus === "Aerobic endurance"));
  assert.ok(suite.every((suggestion) => suggestion.terrainCue.includes("cue:")));
});

test("shuffling avoids recent routes while exposing the full world catalog", () => {
  let recentRouteIds: string[] = [];
  const seenRouteIds = new Set<string>();
  const seenWorlds = new Set<string>();
  for (let index = 0; index < 12; index += 1) {
    const deal = recommendZwiftRoutes("endurance", 200, 80, undefined, index, recentRouteIds);
    const routeIds = deal.map((suggestion) => suggestion.route.id);
    assert.ok(routeIds.every((routeId) => !recentRouteIds.includes(routeId)));
    assert.equal(new Set(deal.map((suggestion) => suggestion.route.world)).size, 3);
    routeIds.forEach((routeId) => seenRouteIds.add(routeId));
    deal.forEach((suggestion) => seenWorlds.add(suggestion.route.world));
    recentRouteIds = [...new Set([...routeIds, ...recentRouteIds])].slice(0, 18);
  }
  assert.ok(seenRouteIds.size >= 24);
  assert.deepEqual([...seenWorlds].sort(), [...ZWIFT_WORLDS].sort());
});

test("every curated route has an official map asset", async () => {
  await Promise.all(ZWIFT_ROUTE_CATALOG.map((route) => (
    access(new URL(`../public/zwift-routes/${route.id}.png`, import.meta.url))
  )));
});

test("parses the guest worlds for a calendar day", () => {
  const html = `
    <td class="spiffy-day-7 current-day day-with-date">
      <span class="spiffy-title">Paris</span>
      <span class="spiffy-title">France</span>
    </td>`;
  assert.deepEqual(parseGuestWorldsFromSchedule(html, { year: 2026, month: 8, day: 7 }), ["Paris", "France"]);
});

test("has a current-month fallback when the live calendar is unavailable", () => {
  assert.deepEqual(fallbackGuestWorlds({ year: 2026, month: 8, day: 12 }), ["Makuri Islands", "Scotland"]);
  assert.deepEqual(fallbackGuestWorlds({ year: 2026, month: 9, day: 1 }), []);
});

test("rest guardrail pauses every route choice", () => {
  const suite = recommendZwiftRoutes("rest", 165, 275 / 2.2046226218);
  assert.ok(suite.every((suggestion) => suggestion.disabled));
  assert.equal(suite.find((suggestion) => suggestion.recommended)?.commitment, 30);
});

test("Zwift route suite uses personalized LTHR cues when configured", () => {
  const suite = recommendZwiftRoutes("endurance", 165, 275 / 2.2046226218, undefined, 0, [], 150);
  assert.ok(suite.every((suggestion) => suggestion.heartRateCue === "Mostly Z2 · 122–134 bpm · brief Z3 hills are fine"));
});