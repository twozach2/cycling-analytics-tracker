# Cycling Analytics

A private cycling dashboard for importing Strava and activity-file data, tracking training trends, and generating explainable daily guidance and Zwift route suggestions.

The `codex/standalone` branch is the local-first application track. Phase 1 replaces the hosted runtime with a Vite React SPA, a Hono server bound to `127.0.0.1:8722`, SQLite, and an on-disk ride-file store. The hosted `main` branch is unchanged.

## Local development

Requires Node.js `>=22.13.0`.

```bash
npm install
copy .env.example .env.local
npm run dev
```

Vite opens the development UI on `http://127.0.0.1:5173` and proxies `/api` to the local service. A production build is served entirely from `http://127.0.0.1:8722`:

```bash
npm run build
npm start
```

Strava remains optional. Put your application client ID and secret in `.env.local`; never commit credentials or tokens.

## Local data

The app uses one device-local rider. SQLite migrations run automatically at startup, and structured data is stored in `cycling.sqlite`. Original activity files and Strava stream payloads are stored under `ride-files/`.

Default data locations:

- Windows: `%LOCALAPPDATA%\\CyclingAnalytics`
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

Phase 2 moves integration credentials and tokens into the operating system's secure credential store. Phase 3 adds the Electron window and startup lifecycle; Phase 4 creates signed installers.
