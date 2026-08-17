import assert from "node:assert/strict";
import test from "node:test";
import { parseOutdoorRouteRequest, parseOutdoorSegmentDownloadRequest } from "../lib/outdoor-routes.ts";
import { BRouterError } from "../server/services/brouter.ts";
import { DELETE, GET, POST, PUT, outdoorRouteAvailability } from "../server/routes/outdoor-routes.ts";
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

  const response = await GET(new Request("http://127.0.0.1/api/routes/outdoor"), { environment: {}, segmentDirectory: "ignored", summarizeSegments: async () => ({ segments: [], totalBytes: 0 }) });
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

test("regional map downloads require explicit consent and expose removable local data", async () => {
  assert.throws(() => parseOutdoorSegmentDownloadRequest({ segment: "W105_N35.rd5", consent: false }), /Confirm/);
  assert.deepEqual(parseOutdoorSegmentDownloadRequest({ segment: "W105_N35.rd5", consent: true }), { segment: "W105_N35.rd5", consent: true });
  let downloaded = false;
  const dependencies = {
    environment: { CYCLING_BROUTER_URL: "http://127.0.0.1:17777" },
    segmentDirectory: "private-routing-data",
    summarizeSegments: async () => downloaded
      ? { segments: [{ name: "W105_N35.rd5", bytes: 20_000_000 }], totalBytes: 20_000_000 }
      : { segments: [], totalBytes: 0 },
    ensureSegment: async (segment: string, directory: string) => {
      assert.equal(segment, "W105_N35.rd5");
      assert.equal(directory, "private-routing-data");
      downloaded = true;
      return { tile: segment, filePath: `${directory}/${segment}`, sourceUrl: `https://brouter.de/brouter/segments4/${segment}`, bytes: 20_000_000, cached: false };
    },
    clearSegments: async () => {
      downloaded = false;
      return { removedSegments: 1, removedBytes: 20_000_000 };
    },
  };
  const denied = await PUT(new Request("http://127.0.0.1/api/routes/outdoor", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ segment: "W105_N35.rd5", consent: false }) }), dependencies);
  assert.equal(denied.status, 400);
  const accepted = await PUT(new Request("http://127.0.0.1/api/routes/outdoor", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ segment: "W105_N35.rd5", consent: true }) }), dependencies);
  assert.equal(accepted.status, 200);
  assert.equal((await accepted.json() as { regionalData: { totalBytes: number } }).regionalData.totalBytes, 20_000_000);
  const removed = await DELETE(new Request("http://127.0.0.1/api/routes/outdoor", { method: "DELETE" }), dependencies);
  assert.equal(removed.status, 200);
  assert.equal((await removed.json() as { removedSegments: number }).removedSegments, 1);
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
