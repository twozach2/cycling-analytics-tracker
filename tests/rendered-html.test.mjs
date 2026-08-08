import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const templateRoot = new URL("../", import.meta.url);

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the rider-profile loading gate", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Dashboard \| Cycling Analytics<\/title>/i);
  assert.match(html, /Ride with the trend/);
  assert.match(html, /Loading your profile/);
  assert.match(html, /saved training baseline is being checked/i);
  assert.doesNotMatch(html, /Phase 2|Phase 3/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|Your site is taking shape/i);
});

test("removes starter preview metadata and dependencies", async () => {
  const [page, layout, packageJson, dashboard, styles] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../app/CyclingDashboard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(page, /<CyclingDashboard \/>/);
  assert.match(layout, /Cycling Analytics/);
  assert.doesNotMatch(page, /codex-preview|_sites-preview|SkeletonPreview/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  assert.match(dashboard, /label: "Plan today"/);
  assert.match(dashboard, /Zwift route match/);
  assert.match(dashboard, /All 10 workout-accessible worlds are in the deck/);
  assert.match(dashboard, /30 min ±10, 60 min ±15, and 90 min ±15/);
  assert.match(dashboard, /Any-world mode/);
  assert.match(dashboard, /Shuffle routes/);
  assert.match(dashboard, /workout access/);
  assert.match(dashboard, /Recent routes stay out of the next six deals/);
  assert.match(dashboard, /Personal route model/);
  assert.match(dashboard, /Body weight \(lb\)/);
  assert.match(dashboard, /Required rider setup/);
  assert.match(dashboard, /Save and open dashboard/);
  assert.match(dashboard, /Export \.md/);
  assert.match(dashboard, /Export this ride/);
  assert.match(dashboard, /cyclingRideMarkdownFilename/);
  assert.match(dashboard, /Virtual \/ Indoor/);
  assert.match(dashboard, /FTP snapshot/);
  assert.match(dashboard, /Not suitable/);
  assert.match(dashboard, /Ride type for/);
  assert.match(dashboard, /method: "PATCH"/);
  assert.match(dashboard, /Strava auto-sync on/);
  assert.match(dashboard, /every 15 minutes while open/);
  assert.match(dashboard, /Estimated cycling VO₂ max/);
  assert.match(dashboard, /rolling 90-day peak/);
  assert.match(styles, /--ride-data-columns: 52px minmax\(190px, 1fr\) 112px 72px 66px 52px 18px/);
  assert.match(styles, /grid-template-columns: var\(--ride-data-columns\) 52px/);
  assert.match(dashboard, /buildCyclingMarkdown/);
  assert.match(dashboard, /World calendar/);
  assert.match(dashboard, /official Zwift map/i);
  assert.match(dashboard, /\/zwift-routes\//);
  assert.doesNotMatch(dashboard, /Elevation shape/);
  assert.doesNotMatch(dashboard, /label: "Phase [23]"/);
  assert.doesNotMatch(dashboard, /Not valid for this ride type/);
  await assert.rejects(access(new URL("app/_sites-preview/SkeletonPreview.tsx", templateRoot)));
  await assert.rejects(access(new URL("app/_sites-preview/preview.css", templateRoot)));
});
