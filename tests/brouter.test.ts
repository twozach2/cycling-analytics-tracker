import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  buildBRouterRequestUrl,
  buildRoundTripSeeds,
  destinationPoint,
  parseBRouterGeoJson,
  segmentDownloadUrlForTile,
  validateSegmentTileName,
  segmentDownloadUrl,
  segmentTileName,
  type RoundTripSeed,
} from "../lib/brouter.ts";
import {
  BRouterClient,
  BRouterError,
  brouterJavaExecutable,
  brouterLaunchArguments,
  ensureRegionalSegment,
} from "../server/services/brouter.ts";

const denver = { latitude: 39.7475, longitude: -104.9506 };

function geoJson(name = "candidate-1") {
  return {
    type: "FeatureCollection",
    features: [{
      type: "Feature",
      properties: {
        name,
        "track-length": "31513",
        "filtered ascend": "92",
        "total-time": "5686",
      },
      geometry: {
        type: "LineString",
        coordinates: [[-104.95, 39.74, 1600], [-104.90, 39.78, 1610]],
      },
    }],
  };
}

test("maps coordinates to BRouter's five-degree regional segment names", () => {
  assert.equal(segmentTileName(denver), "W105_N35.rd5");
  assert.equal(segmentTileName({ latitude: 47, longitude: 7 }), "E5_N45.rd5");
  assert.equal(segmentTileName({ latitude: -0.1, longitude: -0.1 }), "W5_S5.rd5");
  assert.equal(segmentDownloadUrl(denver), "https://brouter.de/brouter/segments4/W105_N35.rd5");
});

test("regional segment names are validated before constructing download URLs", () => {
  assert.equal(validateSegmentTileName("W105_N35.rd5"), "W105_N35.rd5");
  assert.equal(segmentDownloadUrlForTile("W105_N35.rd5"), "https://brouter.de/brouter/segments4/W105_N35.rd5");
  assert.throws(() => validateSegmentTileName("../../secret.rd5"), /invalid/);
  assert.throws(() => validateSegmentTileName("W106_N35.rd5"), /invalid/);
  assert.throws(() => validateSegmentTileName("W185_N35.rd5"), /invalid/);
});

test("builds three closed, deterministic loop seeds around a rider-selected start", () => {
  const seeds = buildRoundTripSeeds(denver, 30, { bearings: [0, 45, 90] });
  assert.equal(seeds.length, 3);
  assert.deepEqual(seeds.map((seed) => seed.bearingDegrees), [0, 45, 90]);
  for (const seed of seeds) {
    assert.equal(seed.waypoints.length, 4);
    assert.deepEqual(seed.waypoints[0], denver);
    assert.deepEqual(seed.waypoints.at(-1), denver);
    assert(seed.requiredSegments.includes("W105_N35.rd5"));
  }
  const tenKmNorth = destinationPoint(denver, 10, 0);
  assert(tenKmNorth.latitude > denver.latitude);
  assert(Math.abs(tenKmNorth.longitude - denver.longitude) < 0.001);
});

test("creates the documented BRouter localhost request contract", () => {
  const seed = buildRoundTripSeeds(denver, 30, { count: 1 })[0]!;
  const url = buildBRouterRequestUrl("http://127.0.0.1:17777", seed);
  assert.equal(url.origin, "http://127.0.0.1:17777");
  assert.equal(url.pathname, "/brouter");
  assert.equal(url.searchParams.get("profile"), "trekking");
  assert.equal(url.searchParams.get("format"), "geojson");
  assert.equal(url.searchParams.get("trackname"), "candidate-1");
  assert.equal(url.searchParams.get("lonlats")?.split("|").length, 4);
});

test("parses route distance, elevation, timing, and geometry without debug messages", () => {
  const parsed = parseBRouterGeoJson(geoJson(), "fallback");
  assert.equal(parsed.id, "candidate-1");
  assert.equal(parsed.distanceKm, 31.513);
  assert.equal(parsed.ascentMeters, 92);
  assert.equal(parsed.estimatedSeconds, 5686);
  assert.deepEqual(parsed.coordinates[0], [-104.95, 39.74, 1600]);
});

test("BRouter client returns typed candidates and identifies missing regional data", async () => {
  const seed = buildRoundTripSeeds(denver, 30, { count: 1 })[0]!;
  const success = new BRouterClient("http://127.0.0.1:17777", {
    fetchImpl: async () => new Response(JSON.stringify(geoJson()), { status: 200 }),
  });
  assert.equal((await success.route(seed)).distanceKm, 31.513);

  const missing = new BRouterClient("http://127.0.0.1:17777", {
    fetchImpl: async () => new Response("datafile W110_N35.rd5 not found", { status: 400 }),
  });
  await assert.rejects(
    () => missing.route(seed),
    (error: unknown) => error instanceof BRouterError
      && error.code === "missing_segment"
      && error.details.segment === "W110_N35.rd5",
  );
});

test("BRouter client separates unavailable, timeout, and invalid-response failures", async () => {
  const seed = buildRoundTripSeeds(denver, 30, { count: 1 })[0]!;
  assert.throws(() => new BRouterClient("https://router.example.com"), /explicit loopback/);
  assert.throws(() => new BRouterClient("http://localhost:17777"), /explicit loopback/);

  const unavailable = new BRouterClient("http://127.0.0.1:17777", {
    fetchImpl: async () => { throw new Error("connection refused"); },
  });
  await assert.rejects(() => unavailable.route(seed), (error: unknown) => error instanceof BRouterError && error.code === "unavailable");

  const timeout = new BRouterClient("http://127.0.0.1:17777", {
    timeoutMs: 5,
    fetchImpl: (_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
    }),
  });
  await assert.rejects(() => timeout.route(seed), (error: unknown) => error instanceof BRouterError && error.code === "timeout");

  const invalid = new BRouterClient("http://127.0.0.1:17777", {
    fetchImpl: async () => new Response("{}", { status: 200 }),
  });
  await assert.rejects(() => invalid.route(seed), (error: unknown) => error instanceof BRouterError && error.code === "invalid_response");
});

test("regional segment downloads are atomic and cached", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "cycling-brouter-segments-"));
  let requests = 0;
  try {
    const fetchImpl = async () => {
      requests += 1;
      return new Response(Uint8Array.from([1, 2, 3, 4]), { status: 200 });
    };
    const downloaded = await ensureRegionalSegment(denver, directory, fetchImpl);
    assert.equal(downloaded.tile, "W105_N35.rd5");
    assert.equal(downloaded.cached, false);
    assert.equal(downloaded.bytes, 4);
    assert.deepEqual([...await readFile(downloaded.filePath)], [1, 2, 3, 4]);

    const cached = await ensureRegionalSegment(denver, directory, fetchImpl);
    assert.equal(cached.cached, true);
    assert.equal(requests, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("sidecar launch contract is identical apart from each platform's Java filename", () => {
  assert.equal(brouterJavaExecutable("/runtime", "linux"), path.join("/runtime", "bin", "java"));
  assert.equal(brouterJavaExecutable("/runtime", "darwin"), path.join("/runtime", "bin", "java"));
  assert.equal(brouterJavaExecutable("C:\\runtime", "win32"), path.join("C:\\runtime", "bin", "java.exe"));

  const options = {
    jarPath: "/runtime/brouter.jar",
    segmentDirectory: "/data/segments4",
    profileDirectory: "/runtime/profiles2",
    customProfileDirectory: "/data/customprofiles",
    port: 17777,
  };
  const args = brouterLaunchArguments(options);
  assert(args.includes("btools.server.RouteServer"));
  assert.deepEqual(args.slice(-3), ["17777", "1", "127.0.0.1"]);
});

test("branch-scoped feasibility workflow covers all desktop operating systems and pins BRouter source", async () => {
  const workflow = await readFile(path.resolve(".github", "workflows", "brouter-feasibility.yml"), "utf8");
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /push:/);
  assert.match(workflow, /codex\/coaching-product/);
  assert.match(workflow, /paths:/);
  assert.match(workflow, /windows-latest/);
  assert.match(workflow, /macos-latest/);
  assert.match(workflow, /ubuntu-latest/);
  assert.match(workflow, /v1\.7\.10/);
  assert.match(workflow, /4d2639af77ea5ed9c30d3e400764eb6f9e8522da/);
  assert.match(workflow, /npm run spike:brouter/);
});

test("round-trip generation remains sequential for BRouter's single worker", async () => {
  const order: string[] = [];
  const client = new BRouterClient("http://127.0.0.1:17777", {
    fetchImpl: async (input) => {
      const name = new URL(input.toString()).searchParams.get("trackname")!;
      order.push(`start:${name}`);
      await Promise.resolve();
      order.push(`end:${name}`);
      return new Response(JSON.stringify(geoJson(name)), { status: 200 });
    },
  });
  const candidates = await client.roundTrips(denver, 30);
  assert.equal(candidates.length, 3);
  assert.deepEqual(order, [
    "start:candidate-1", "end:candidate-1",
    "start:candidate-2", "end:candidate-2",
    "start:candidate-3", "end:candidate-3",
  ]);
});

test("route seed type can express the measured neighboring-tile failure", () => {
  const seed: RoundTripSeed = {
    id: "missing-tile",
    bearingDegrees: 270,
    targetDistanceKm: 10,
    waypoints: [
      { latitude: 39.75, longitude: -105.22 },
      { latitude: 39.78, longitude: -105.18 },
      { latitude: 39.75, longitude: -105.22 },
    ],
    requiredSegments: ["W110_N35.rd5"],
  };
  assert.deepEqual(seed.requiredSegments, ["W110_N35.rd5"]);
});
