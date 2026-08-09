# Cycling Analytics

A private cycling dashboard for importing Strava and activity-file data, tracking training trends, and generating explainable daily guidance and Zwift route suggestions.

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
