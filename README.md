# Cycling Analytics

A private cycling dashboard for importing Strava and activity-file data, tracking training trends, and generating explainable daily guidance and Zwift route suggestions.

## Coach Mode

Coach Mode is a deterministic, evidence-gated recommendation engine rather than a free-form AI coach. It combines the saved recovery check-in with recent load, time since hard work, ride classification, personal duration/load baselines, and explicit data-quality provenance. Every recommendation shows the supporting signals, cautions, safety guardrails, confidence, and algorithm version used to produce it.

Hard-session advice is withheld or downgraded when pain or illness is reported, the recovery check-in is missing, recent evidence is weak, two hard sessions already occurred in seven days, or recovery time is insufficient. Future days are deliberately low-confidence placeholders and are regenerated from current evidence instead of being treated as a rigid prescription.

Workload is presented as an explicit comparison: total load from the last seven days divided by the 28-day total normalized to a weekly average. A stable baseline requires at least four rides spanning 14 days. The ratio is a review signal for sudden workload change, not an injury prediction.

After a same-day ride is imported, Coach Mode compares its completed stimulus with an inferred pre-ride recommendation, marks it as matched, lighter, or harder, and regenerates tomorrow around the resulting load. The inference uses the current saved check-in and pre-ride history because older daily recommendations were not persisted.

Trend claims use genuinely comparable Zone 2 rides: the same indoor/outdoor environment, non-low classification and data quality, usable power plus heart rate, and intensity within 0.05 IF of the cohort median. Two rides create a possible signal, three or four a likely signal, and an established trend requires at least five rides spanning three weeks. Outdoor trends remain capped because wind, traffic, surface, and drafting are not observed.

Each ride exposes the actual record count received for every detailed signal and distinguishes it from recorded summaries, derived values, or unavailable data. Existing Strava streams are backfilled from their stored payloads. The Markdown exporter includes this provenance and a complete Coach Mode reasoning snapshot for later audit.

The `codex/standalone` branch is the local-first application track. Phase 1 replaces the hosted runtime with a Vite React SPA, a Hono server bound to `127.0.0.1:8722`, SQLite, and an on-disk ride-file store. The hosted `main` branch is unchanged.

## Local development

Requires Node.js `>=22.13.0`.

```bash
npm install
npm run dev
```

Vite opens the development UI on `http://127.0.0.1:5173` and proxies `/api` to the local service. A production build is served entirely from `http://127.0.0.1:8722`:

```bash
npm run build
npm start
```

For day-to-day visual iteration on Windows, use the persistent browser preview:

```bash
npm run preview:web
```

On Windows, install a one-click launcher on the desktop with:

```bash
npm run preview:install-shortcut
```

The command starts the API on port `8723`, starts the hot-reloading dashboard on `http://127.0.0.1:5173`, and opens the browser automatically. Keep its terminal window open while using the preview; press `Ctrl+C` to stop it. Running the command again while it is active simply reopens the existing preview.

Preview data persists in `%LOCALAPPDATA%\\CyclingAnalyticsPreview` and is deliberately separate from the installed Electron app. On first launch, it takes a snapshot of the desktop app's rides and preferences when available, but never copies encrypted Strava credentials. This prevents an in-progress browser build from sharing a live SQLite database or overwriting the desktop app's secrets. Set `CYCLING_PREVIEW_DATA_DIR` before launching if you want a different preview data directory.

Strava remains optional. Configure your own Strava API application from the Import tab; client credentials are no longer read from environment variables.

The Electron desktop shell uses the same local service and can be launched with:

```bash
npm run dev:electron
```

## Local data

The app uses one device-local rider. SQLite migrations run automatically at startup, and structured data is stored in `cycling.sqlite`. Original activity files and Strava stream payloads are stored under `ride-files/`.

Strava client credentials and OAuth tokens are deliberately excluded from SQLite. In the Electron app they are encrypted with the operating system's secure storage. Existing Phase 2 owner-only plaintext files are migrated to encrypted values on first desktop launch.

Default data locations:

- Installed Windows app: `%APPDATA%\\cycling-analytics`
- Windows persistent browser preview: `%LOCALAPPDATA%\\CyclingAnalyticsPreview`
- Windows local-server development: `%LOCALAPPDATA%\\CyclingAnalytics`
- macOS: `~/Library/Application Support/CyclingAnalytics`
- Linux: `$XDG_DATA_HOME/CyclingAnalytics` or `~/.local/share/CyclingAnalytics`

Set `CYCLING_DATA_DIR` to use another directory. This is especially useful for development and tests.

## Validation

```bash
npm run lint
npm test
```

After changing `db/schema.ts`, generate and review a migration:

```bash
npm run db:generate
```

Phase 3 adds the Electron window, startup lifecycle, and OS-encrypted secret storage. Phase 4 adds cross-platform packaging and a signing-ready release workflow.

## Desktop distribution

Build the installer for the current operating system, or select a platform explicitly:

```bash
npm run dist
npm run dist:win
npm run dist:mac
npm run dist:mac:unsigned
npm run dist:linux
```

Artifacts are written to `dist-installers/`. The release workflow also builds natively on Windows, macOS, and Ubuntu for version tags such as `v0.1.0`, or through a manual workflow run.

Windows signing is optional and uses `WIN_CSC_LINK` plus `WIN_CSC_KEY_PASSWORD`. Signed and notarized macOS packages require `MAC_CSC_LINK`, `MAC_CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID` GitHub Actions secrets. Use `dist:mac:unsigned` for local preview builds without those credentials; CI does the same instead of failing the entire three-platform build.
