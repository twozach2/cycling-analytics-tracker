import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import { createApp } from "../server/app.ts";

test("the local server serves the built Vite application shell", async () => {
  const response = await createApp().request("http://127.0.0.1:8722/");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Cycling Analytics<\/title>/i);
  assert.match(html, /<div id="root"><\/div>/i);
  assert.match(html, /\/assets\/index-/i);
});

test("keeps the dashboard features while removing hosted runtime dependencies", async () => {
  const [index, packageJson, dashboard, styles, manifest, server, database, fileStore] = await Promise.all([
    readFile(new URL("../index.html", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../app/CyclingDashboard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"),
    readFile(new URL("../server/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../server/platform/db.ts", import.meta.url), "utf8"),
    readFile(new URL("../server/platform/file-store.ts", import.meta.url), "utf8"),
  ]);

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

  assert.match(dashboard, /label: "Plan today"/);
  assert.match(dashboard, /Zwift route match/);
  assert.match(dashboard, /Shuffle routes/);
  assert.match(dashboard, /Export \.md/);
  assert.match(dashboard, /Export this ride/);
  assert.match(dashboard, /Virtual \/ Indoor/);
  assert.match(dashboard, /FTP snapshot/);
  assert.match(dashboard, /Strava auto-sync on/);
  assert.match(dashboard, /beforeinstallprompt/);
  assert.match(dashboard, /Night Circuit/);
  assert.match(dashboard, /cycling-analytics:ui-preferences/);
  assert.doesNotMatch(dashboard, /next\/image|<Image/);
  assert.match(styles, /html\[data-theme="night-city"\]/);
  assert.match(styles, /--lime: #f9f002/);
  assert.match(styles, /--font-geist-sans: "Geist Variable"/);
  assert.match(manifest, /"display": "standalone"/);
  await access(new URL("../public/cycling-analytics-icon-192.png", import.meta.url));
  await access(new URL("../public/cycling-analytics-icon-512.png", import.meta.url));
});
