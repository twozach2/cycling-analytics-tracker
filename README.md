# Cycling Analytics

A private, full-stack cycling dashboard for importing Strava and activity-file data, tracking training trends, and generating explainable daily guidance and Zwift route suggestions.

## Highlights

- Required rider setup for FTP and body weight—no generic athlete defaults
- Strava OAuth with six-month backfill, incremental sync, and duplicate protection
- FIT, TCX, and GPX uploads with original-file retention
- Power, heart-rate, cadence, workload, FTP, and aerobic-durability analysis
- Virtual/indoor/outdoor classification with trainer-workout subtypes and environment-matched comparisons
- Per-ride FTP snapshots plus conservative decoupling eligibility checks
- Personalized Zwift route-time ranges using rider weight, sustainable power, distance, and climbing
- Markdown export of the complete ride log or one selected ride, including rider configuration and methodology
- Cloudflare D1 persistence, R2 file storage, and ChatGPT-authenticated rider profiles

## Local development

Requires Node.js `>=22.13.0`.

```bash
npm install
npm run dev
```

Copy `.env.example` to `.env.local` and add your own Strava application credentials when testing the integration locally. Never commit real credentials or tokens.

## Validation

```bash
npm run build
npm test
```

Generate a Drizzle migration after changing `db/schema.ts`:

```bash
npm run db:generate
```

## Privacy and data

Rider settings and activity records are associated with the authenticated user on the current deployment. Structured data is stored in D1; original activity files and imported stream payloads are stored in R2. FTP and body weight must be supplied by the rider before dependent calculations or Strava synchronization are enabled.
