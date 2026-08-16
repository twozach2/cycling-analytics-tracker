import assert from "node:assert/strict";
import test from "node:test";
import * as callbackRoute from "../app/api/integrations/strava/callback/route.ts";
import { createApp } from "../server/app.ts";

test("Electron OAuth callbacks finish in a small return-to-app page", async () => {
  process.env.CYCLING_STANDALONE = "electron";
  try {
    const denied = await callbackRoute.GET(new Request("http://127.0.0.1:8722/api/integrations/strava/callback?error=access_denied"));
    assert.equal(denied.status, 302);
    assert.equal(denied.headers.get("location"), "http://127.0.0.1:8722/oauth/strava/complete?status=strava-denied");

    const complete = await createApp().request("http://127.0.0.1:8722/oauth/strava/complete?status=strava-connected");
    const html = await complete.text();
    assert.equal(complete.status, 200);
    assert.match(complete.headers.get("content-security-policy") ?? "", /default-src 'none'/);
    assert.match(html, /Strava connected/);
    assert.match(html, /return to Cycling Analytics/i);
  } finally {
    delete process.env.CYCLING_STANDALONE;
  }
});

test("Browser mode retains the existing dashboard callback", async () => {
  delete process.env.CYCLING_STANDALONE;
  const denied = await callbackRoute.GET(new Request("http://127.0.0.1:8722/api/integrations/strava/callback?error=access_denied"));
  assert.equal(denied.headers.get("location"), "http://127.0.0.1:8722/?integration=strava-denied");
});
