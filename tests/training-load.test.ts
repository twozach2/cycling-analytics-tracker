import assert from "node:assert/strict";
import test from "node:test";
import { buildTrainingLoadModel, describeTrainingLoad, FATIGUE_TIME_CONSTANT_DAYS, FITNESS_TIME_CONSTANT_DAYS, TRAINING_LOAD_MODEL_VERSION } from "../lib/training-load";

const ride = (date: string, trainingLoad: number) => ({ date, trainingLoad });

test("withholds modeled fitness and fatigue when no ride load exists", () => {
  const model = buildTrainingLoadModel([], "2026-08-15T12:00:00");
  assert.equal(model.algorithmVersion, TRAINING_LOAD_MODEL_VERSION);
  assert.equal(model.status, "insufficient");
  assert.deepEqual(model.current, {
    sevenDayLoad: 0,
    fitnessLoad: null,
    fatigueLoad: null,
    form: null,
    loadRatio: null,
  });
  assert.equal(model.points.length, 0);
});

test("keeps short histories explicitly provisional instead of presenting a stable ratio", () => {
  const model = buildTrainingLoadModel([
    ride("2026-08-01T08:00:00", 40),
    ride("2026-08-05T08:00:00", 50),
    ride("2026-08-09T08:00:00", 45),
    ride("2026-08-15T08:00:00", 55),
  ], "2026-08-15T12:00:00");

  assert.equal(model.status, "provisional");
  assert.equal(model.current.loadRatio, null);
  assert.equal(model.current.sevenDayLoad, 100);
  assert.match(model.limitations[0], /42-day fitness estimate is still warming up/);
});

test("builds established 42-day fitness and 7-day fatigue estimates from one daily series", () => {
  const rides = Array.from({ length: 9 }, (_, index) => ride(
    new Date(2026, 5, 28 + (index * 6), 8).toISOString(),
    index >= 7 ? 90 : 45,
  ));
  const model = buildTrainingLoadModel(rides, new Date(2026, 7, 15, 12));

  assert.equal(FITNESS_TIME_CONSTANT_DAYS, 42);
  assert.equal(FATIGUE_TIME_CONSTANT_DAYS, 7);
  assert.equal(model.status, "established");
  assert.equal(model.points.length, 49);
  assert.ok(model.current.fitnessLoad !== null);
  assert.ok(model.current.fatigueLoad !== null);
  assert.ok(model.current.fatigueLoad > model.current.fitnessLoad);
  assert.ok((model.current.form ?? 0) < 0);
  assert.ok((model.current.loadRatio ?? 0) > 1);
  assert.equal(model.current.sevenDayLoad, 180);
  assert.match(describeTrainingLoad(model), /Fatigue/);
});

test("aggregates rides by day and produces seven exact weekly totals", () => {
  const rides = [
    ride("2026-08-15T08:00:00", 30),
    ride("2026-08-15T18:00:00", 20),
    ride("2026-08-10T08:00:00", 40),
    ride("2026-08-08T08:00:00", 25),
  ];
  const model = buildTrainingLoadModel(rides, "2026-08-15T23:00:00");

  assert.equal(model.current.sevenDayLoad, 90);
  assert.equal(model.weeklyTotals.length, 7);
  assert.equal(model.weeklyTotals.at(-2), 25);
  assert.equal(model.points.at(-1)?.dailyLoad, 50);
});
