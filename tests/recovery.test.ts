import assert from "node:assert/strict";
import test from "node:test";
import { restingHeartRateBaseline } from "../app/api/recovery/route";

test("resting-HR baseline uses one reading per prior day and needs three days", () => {
  const rows = [
    { loggedAt: "2026-08-12T14:00:00.000Z", restingHeartRate: 64 },
    { loggedAt: "2026-08-11T15:00:00.000Z", restingHeartRate: 62 },
    { loggedAt: "2026-08-11T12:00:00.000Z", restingHeartRate: 90 },
    { loggedAt: "2026-08-10T12:00:00.000Z", restingHeartRate: 60 },
    { loggedAt: "2026-08-09T12:00:00.000Z", restingHeartRate: 61 },
  ];

  assert.equal(restingHeartRateBaseline(rows, "2026-08-12"), 61);
  assert.equal(restingHeartRateBaseline(rows.slice(0, 3), "2026-08-12"), null);
});
