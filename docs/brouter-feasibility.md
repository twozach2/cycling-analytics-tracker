# BRouter feasibility spike

Date: 2026-08-15
Product branch: `codex/coaching-product`
Pinned engine: BRouter `v1.7.10`

## Decision

**Conditional go.** BRouter is fast enough, small enough, local-first, elevation-aware, and exposes the route geometry and metadata the product needs. Keep it behind a server-side adapter and do not add route UI until the cross-platform matrix has run successfully.

The product should bundle a minimal per-platform Java runtime instead of depending on a system Java installation. Regional `.rd5` data must remain outside the installer and download on demand, because tile size varies substantially by region.

## What was proven on Windows

The pinned server was built from the official source, launched on `127.0.0.1`, and routed against the official `W105_N35.rd5` OpenStreetMap/elevation tile. The JAR ran both on the existing Java 11 installation and on a Java 17 runtime reduced with `jlink`.

| Measurement | Result |
| --- | ---: |
| Server startup, existing Java 11 | 645 ms |
| Server startup, minimal bundled Java 17 | 609 ms |
| BRouter JAR | 2.23 MB |
| Profiles and lookup data | 0.25 MB |
| Denver regional tile | 20.72 MB |
| Minimal Java runtime, installed | 41.94 MB |
| Minimal Java runtime, compressed | 28.05 MB |
| Installed routing total with one tile | 65.15 MB |

Three distinct public-coordinate benchmark loops were generated sequentially with the `trekking` profile:

| Candidate | Route latency | Distance | Ascent |
| --- | ---: | ---: | ---: |
| 1 | 812 ms | 31.5 km | 92 m |
| 2 | 1,439 ms | 46.9 km | 106 m |
| 3 | 860 ms | 41.3 km | 136 m |

The first request through a newly launched minimal runtime completed in 1,755 ms. This is still acceptable for an interactive route suggestion that produces three choices.

## Failure behavior

- A candidate crossing into a tile that was not installed returned HTTP 400 in 73 ms with `datafile W110_N35.rd5 not found`.
- The adapter converts that response into `missing_segment` and preserves the required tile name so the app can offer a download and retry.
- Unavailable sidecars, timeouts, general routing failures, invalid GeoJSON, and segment-download failures are separate typed states.
- Downloads use a temporary file followed by an atomic rename; a partial file is removed after failure.

## Round-trip strategy

BRouter routes waypoint sequences; it does not provide a single native "make a round trip of N km" request. The spike creates triangular seed geometries at three bearings, asks BRouter to snap and route each sequence, and returns the three real route results. The seed's straight-line target is intentionally an approximation. Phase 3 must score returned routes against duration, distance, elevation, road suitability, and novelty rather than pretending the seed guarantees an exact distance.

## Cross-platform gate

The route contract is OS-neutral Java. BRouter's official project provides launchers for Windows and for macOS/Linux, and the app now contains a manual GitHub Actions matrix that builds the pinned source, downloads a real regional tile, starts the sidecar, generates three loops, and validates the missing-tile failure on all three operating systems.

The matrix has not run from this local-only commit. Do not call Phase 2 complete until `.github/workflows/brouter-feasibility.yml` passes on `windows-latest`, `macos-latest`, and `ubuntu-latest`.

## Packaging plan if the matrix passes

1. Build and checksum BRouter from the pinned MIT-licensed source in the release pipeline.
2. Build one minimal Java runtime per target OS/architecture with `jlink`.
3. Package the JAR, selected profiles, lookup data, and runtime under Electron `extraResources`.
4. Store downloaded `.rd5` tiles under the existing private app-data directory, never inside Git or `app.asar`.
5. Bind the sidecar to `127.0.0.1`, choose an app-controlled port, cap memory at 128 MB, and stop it with Electron.
6. Publish BRouter/OpenStreetMap attribution and a routing-data removal control before route UI ships.

## Reproducing the smoke benchmark

Build the pinned official source first, then run:

```text
npm run spike:brouter -- --brouter-root /path/to/brouter-v1.7.10
```

The script downloads only the benchmark region when it is absent, starts the local sidecar, generates three routes, verifies the neighboring-tile failure, prints JSON measurements, and stops the process.

Primary references:

- https://github.com/abrensch/brouter
- https://github.com/abrensch/brouter/blob/master/brouter-server/src/main/java/btools/server/request/ServerHandler.java
- https://brouter.de/brouter/segments4/
