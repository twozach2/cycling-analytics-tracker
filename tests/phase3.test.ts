import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import test from "node:test";
import { derivePowerDuration, deriveStreamMetrics, type ActivitySample } from "../lib/activity-parser.ts";
import { buildWeeklyPlan, predictFtp, projectFtpGoal, recommendWorkout } from "../lib/phase3.ts";
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

test("goal projection presents three scenarios", () => {
  const projection = projectFtpGoal(165, 200, "2026-08-07");
  assert.ok(projection.aggressiveDate! < projection.currentTrendDate!);
  assert.ok(projection.currentTrendDate! < projection.conservativeDate!);
  assert.match(projection.disclaimer, /not a promise/i);
});

test("pain makes workout guidance and the generated week cautious", () => {
  const input = { readinessScore: 80, kneePain: 3, acuteChronicRatio: 1, recentHardSessions: 0 };
  assert.match(recommendWorkout(input).primary, /Rest|recovery/);
  assert.equal(recommendWorkout(input).mode, "rest");
  assert.equal(buildWeeklyPlan(input)[0].session, "Rest + mobility");
});

test("Zwift route suite uses the requested time windows and FTP-based targets", () => {
  const suite = recommendZwiftRoutes("tempo", 165);
  assert.deepEqual(suite.map((suggestion) => suggestion.commitment), [30, 60, 90]);
  assert.equal(new Set(suite.map((suggestion) => suggestion.route.id)).size, 3);
  assert.deepEqual(suite.map((suggestion) => suggestion.targetWatts), ["125–145 W", "125–145 W", "125–145 W"]);
  assert.equal(suite.find((suggestion) => suggestion.recommended)?.commitment, 60);
  assert.equal(ZWIFT_ROUTE_COUNT, 75);
  assert.ok(suite.every((suggestion) => (
    suggestion.estimatedMinutes >= ROUTE_TIME_WINDOWS[suggestion.commitment].minimumMinutes
      && suggestion.estimatedMinutes <= ROUTE_TIME_WINDOWS[suggestion.commitment].maximumMinutes
  )));
});

test("Zwift route timing accounts for rider weight and sustainable W/kg", () => {
  const laReine = ZWIFT_ROUTE_CATALOG.find((route) => route.id === "france-la-reine")!;
  const estimate = estimateZwiftRouteTime(laReine, 165, 275 / 2.2046226218);
  assert.ok(estimate.minimumPowerWatts >= 124 && estimate.minimumPowerWatts <= 126);
  assert.ok(estimate.maximumPowerWatts >= 149 && estimate.maximumPowerWatts <= 151);
  assert.ok(estimate.minimumMinutes > 180);
  assert.ok(estimate.maximumMinutes > estimate.minimumMinutes);
});

test("Zwift route suite can be limited to a supplied world pool", () => {
  const suite = recommendZwiftRoutes("endurance", 200, ["Watopia", "Paris", "France"]);
  assert.ok(suite.every((suggestion) => ["Watopia", "Paris", "France"].includes(suggestion.route.world)));
  assert.ok(suite.every((suggestion) => suggestion.reason.includes("change of scenery")));
});

test("shuffling avoids recent routes while exposing the full world catalog", () => {
  let recentRouteIds: string[] = [];
  const seenRouteIds = new Set<string>();
  const seenWorlds = new Set<string>();
  for (let index = 0; index < 12; index += 1) {
    const deal = recommendZwiftRoutes("endurance", 200, undefined, index, recentRouteIds);
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
  const suite = recommendZwiftRoutes("rest", 165);
  assert.ok(suite.every((suggestion) => suggestion.disabled));
  assert.equal(suite.find((suggestion) => suggestion.recommended)?.commitment, 30);
});
