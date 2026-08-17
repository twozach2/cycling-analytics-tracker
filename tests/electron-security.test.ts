import assert from "node:assert/strict";
import test from "node:test";
import { isLocalAppUrl, isTrustedExternalUrl } from "../electron/security.ts";

test("Electron navigation accepts only the fixed local application origin", () => {
  assert.equal(isLocalAppUrl("http://127.0.0.1:8722/"), true);
  assert.equal(isLocalAppUrl("http://127.0.0.1:8722/api/integrations/strava/start"), true);
  assert.equal(isLocalAppUrl("http://localhost:8722/"), false);
  assert.equal(isLocalAppUrl("http://127.0.0.1:9999/"), false);
});

test("Electron opens only explicitly trusted HTTPS hosts externally", () => {
  assert.equal(isTrustedExternalUrl("https://www.strava.com/oauth/authorize"), true);
  assert.equal(isTrustedExternalUrl("https://strava.com/settings/api"), true);
  assert.equal(isTrustedExternalUrl("https://developer.garmin.com/gc-developer-program/activity-api/"), true);
  assert.equal(isTrustedExternalUrl("https://brouter.de/brouter/"), true);
  assert.equal(isTrustedExternalUrl("https://www.openstreetmap.org/copyright"), true);
  assert.equal(isTrustedExternalUrl("http://www.strava.com/oauth/authorize"), false);
  assert.equal(isTrustedExternalUrl("https://www.strava.com.evil.example/oauth"), false);
  assert.equal(isTrustedExternalUrl("https://evil.example/?next=https://www.strava.com"), false);
  assert.equal(isTrustedExternalUrl("not a URL"), false);
});
