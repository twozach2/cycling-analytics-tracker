import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import { createApp } from "../server/app.ts";

test("the local server serves the built Vite application shell", async () => {
  const response = await createApp().request("http://127.0.0.1:8722/");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  assert.match(response.headers.get("content-security-policy") ?? "", /default-src 'self'/);
  assert.match(response.headers.get("content-security-policy") ?? "", /frame-ancestors 'none'/);
  assert.equal(response.headers.get("permissions-policy"), "camera=(), microphone=(), geolocation=()");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("x-frame-options"), "DENY");

  const html = await response.text();
  assert.match(html, /<title>Cycling Analytics<\/title>/i);
  assert.match(html, /<div id="root"><\/div>/i);
  assert.match(html, /\/assets\/index-/i);
});

test("keeps the dashboard features while removing hosted runtime dependencies", async () => {
  const [index, packageJson, dashboard, methodology, theme, styles, manifest, server, database, fileStore] = await Promise.all([
    readFile(new URL("../index.html", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../app/CyclingDashboard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/views/Methodology.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/theme.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"),
    readFile(new URL("../server/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../server/platform/db.ts", import.meta.url), "utf8"),
    readFile(new URL("../server/platform/file-store.ts", import.meta.url), "utf8"),
  ]);
  const interfaceSource = [dashboard, methodology, theme].join("\n");

  assert.match(index, /Cycling Analytics/);
  assert.match(index, /manifest\.webmanifest/);
  assert.match(packageJson, /"hono"/);
  assert.match(packageJson, /"better-sqlite3"/);
  assert.doesNotMatch(packageJson, /vinext|wrangler|@cloudflare\/vite-plugin|react-server-dom-webpack/);
  assert.match(server, /127\.0\.0\.1/);
  assert.match(server, /8722/);
  assert.match(database, /journal_mode = WAL/);
  assert.match(database, /migrate\(/);
  assert.match(fileStore, /rideFilesDirectory/);
  assert.match(fileStore, /Invalid ride-file key/);
  assert.match(dashboard, /Connect your own Strava API application/);
  assert.match(dashboard, /\/api\/settings\/strava/);
  assert.match(dashboard, /Authorization Callback Domain/);
  assert.match(dashboard, /Selected ride cadence/);
  assert.match(dashboard, /Cadence across every ride/);
  assert.match(dashboard, /Zero-rpm coasting is excluded/i);
  assert.doesNotMatch(dashboard, /Cadence stream needed/);

  assert.match(dashboard, /label: "Coach"/);
  assert.match(dashboard, /Coach Mode ·/);
  assert.match(dashboard, /Every input stays visible/);
  assert.match(dashboard, /What today’s riding contributed/);
  assert.match(dashboard, /never to a pass\/fail score/);
  assert.match(dashboard, /Choose what makes you want to ride/);
  assert.match(dashboard, /Optional stretch:/);
  assert.match(dashboard, /42-day fitness/);
  assert.match(dashboard, /7-day fatigue/);
  assert.match(dashboard, /These are workload models, not direct physiological measurements/);
  assert.match(dashboard, /Claims grow with the evidence/);
  assert.match(dashboard, /Data quality \+ provenance/);
  assert.match(dashboard, /Future days are low-confidence placeholders/);
  assert.match(dashboard, /Route ideas for today/);
  assert.match(dashboard, /Shuffle routes/);
  assert.match(dashboard, /Export \.md/);
  assert.match(dashboard, /Export this ride/);
  assert.match(dashboard, /Virtual \/ Indoor/);
  assert.match(dashboard, /FTP snapshot/);
  assert.match(dashboard, /Strava auto-sync on/);
  assert.match(dashboard, /beforeinstallprompt/);
  assert.match(interfaceSource, /Night Circuit/);
  assert.match(dashboard, /cycling-analytics:ui-preferences/);
  assert.doesNotMatch(dashboard, /next\/image|<Image/);
  assert.match(styles, /html\[data-theme="night-city"\]/);
  assert.match(styles, /--lime: #f9f002/);
  assert.match(styles, /--font-geist-sans: "Geist Variable"/);
  assert.match(styles, /select option, select optgroup \{ background-color: var\(--field\); color: var\(--ink\); \}/);
  assert.match(styles, /select:disabled \{ color: var\(--muted\); -webkit-text-fill-color: var\(--muted\); opacity: 1; \}/);
  assert.match(styles, /\.environment-tag, \.workout-tag .*color: var\(--tag-text\)/);
  assert.match(styles, /\.environment-tag\.environment-virtual \{ background: var\(--tag-zone-bg\); \}/);
  assert.match(styles, /\.coach-reflection-grid/);
  assert.match(styles, /\.route-intention/);
  assert.match(styles, /\.workload-equation/);
  assert.match(manifest, /"display": "standalone"/);
  await access(new URL("../public/cycling-analytics-icon-192.png", import.meta.url));
  await access(new URL("../public/cycling-analytics-icon-512.png", import.meta.url));
});
