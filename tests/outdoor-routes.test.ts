import assert from "node:assert/strict";
import test from "node:test";
import { parseOutdoorRouteRequest } from "../lib/outdoor-routes.ts";
import { BRouterError } from "../server/services/brouter.ts";
import { GET, POST, outdoorRouteAvailability } from "../server/routes/outdoor-routes.ts";
import { createApp } from "../server/app.ts";

test("outdoor routing stays unavailable until a loopback engine is configured", async () => {
  const unavailable = outdoorRouteAvailability({});
  assert.deepEqual(unavailable, {
    status: "not_configured",
    engine: "brouter",
    localOnly: true,
    canGenerate: false,
    message: "Outdoor loop generation is not installed yet. Indoor route ideas remain fully available.",
  });
  assert.equal(outdoorRouteAvailability({ CYCLING_BROUTER_URL: "https://example.com" }).canGenerate, false);

  const response = GET(new Request("http://127.0.0.1/api/routes/outdoor"), { environment: {} });
  assert.equal(response.status, 200);
  assert.equal((await response.json() as { status: string }).status, "not_configured");
});
test("the local application exposes outdoor routing availability", async () => {
  const previous = process.env.CYCLING_BROUTER_URL;
  delete process.env.CYCLING_BROUTER_URL;
  const response = await createApp().request("http://127.0.0.1/api/routes/outdoor");
  if (previous === undefined) delete process.env.CYCLING_BROUTER_URL; else process.env.CYCLING_BROUTER_URL = previous;
  assert.equal((await response.json() as { status: string }).status, "not_configured");
});


test("validates outdoor route coordinates and target distance at the API boundary", () => {
  assert.deepEqual(parseOutdoorRouteRequest({
    start: { latitude: 39.7392, longitude: -104.9903 },
    targetDistanceKm: 24,
  }), {
    start: { latitude: 39.7392, longitude: -104.9903 },
    targetDistanceKm: 24,
  });
  assert.throws(() => parseOutdoorRouteRequest({ start: { latitude: 91, longitude: 0 }, targetDistanceKm: 20 }), /Latitude/);
  assert.throws(() => parseOutdoorRouteRequest({ start: { latitude: 40, longitude: 0 }, targetDistanceKm: 3 }), /between 5 and 300/);
});

test("returns three local candidates through the configured service contract", async () => {
  const response = await POST(new Request("http://127.0.0.1/api/routes/outdoor", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ start: { latitude: 39.7392, longitude: -104.9903 }, targetDistanceKm: 24 }),
  }), {
    environment: { CYCLING_BROUTER_URL: "http://127.0.0.1:17777" },
    createClient: () => ({
      roundTrips: async () => [1, 2, 3].map((index) => ({
        id: `candidate-${index}`,
        distanceKm: 23 + index,
        ascentMeters: 200 + index,
        estimatedSeconds: 3_600,
        coordinates: [[-104.99, 39.74], [-104.98, 39.75]],
      })),
    }),
  });
  assert.equal(response.status, 200);
  const payload = await response.json() as { localOnly: boolean; candidates: unknown[] };
  assert.equal(payload.localOnly, true);
  assert.equal(payload.candidates.length, 3);
});

test("surfaces missing map data without downloading it silently", async () => {
  const response = await POST(new Request("http://127.0.0.1/api/routes/outdoor", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ start: { latitude: 39.7392, longitude: -104.9903 }, targetDistanceKm: 24 }),
  }), {
    environment: { CYCLING_BROUTER_URL: "http://127.0.0.1:17777" },
    createClient: () => ({
      roundTrips: async () => { throw new BRouterError("missing_segment", "Regional routing data W105_N35.rd5 is required.", { segment: "W105_N35.rd5" }); },
    }),
  });
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), {
    error: "Regional routing data W105_N35.rd5 is required.",
    code: "missing_segment",
    requiredSegment: "W105_N35.rd5",
  });
});
