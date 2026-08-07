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

test("server-renders the cycling analytics dashboard", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Dashboard \| Cycling Analytics<\/title>/i);
  assert.match(html, /Ride with the trend/);
  assert.match(html, /Dashboard/);
  assert.match(html, /Plan today/);
  assert.match(html, /Ride log/);
  assert.match(html, /Watts \/ heartbeat/);
  assert.match(html, /Power-to-heart-rate trend/);
  assert.match(html, /Import ride/);
  assert.doesNotMatch(html, /Phase 2|Phase 3/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|Your site is taking shape/i);
});

test("removes starter preview metadata and dependencies", async () => {
  const [page, layout, packageJson, dashboard] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../app/CyclingDashboard.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(page, /<CyclingDashboard \/>/);
  assert.match(layout, /Cycling Analytics/);
  assert.doesNotMatch(page, /codex-preview|_sites-preview|SkeletonPreview/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  assert.match(dashboard, /label: "Plan today"/);
  assert.doesNotMatch(dashboard, /label: "Phase [23]"/);
  await assert.rejects(access(new URL("app/_sites-preview/SkeletonPreview.tsx", templateRoot)));
  await assert.rejects(access(new URL("app/_sites-preview/preview.css", templateRoot)));
});
