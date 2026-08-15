import assert from "node:assert/strict";
import test from "node:test";
import { localDayKey } from "../lib/shared/date.ts";
import { median, round } from "../lib/shared/math.ts";

test("shared math utilities preserve median and rounding behavior", () => {
  assert.equal(median([4, 1, 3]), 3);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.equal(median([Number.NaN, 7]), 7);
  assert.equal(median([]), null);
  assert.equal(round(12.345, 2), 12.35);
});

test("local day keys use calendar dates without shifting date-only values", () => {
  assert.equal(localDayKey("2026-08-15"), "2026-08-15");
  assert.equal(localDayKey("not-a-date"), "");
  const local = new Date(2026, 7, 15, 23, 30, 0);
  assert.equal(localDayKey(local), "2026-08-15");
});
