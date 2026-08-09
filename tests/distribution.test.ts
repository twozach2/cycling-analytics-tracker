import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("desktop packaging ships only compiled app code plus runtime resources", async () => {
  const config = await readFile(new URL("../electron-builder.yml", import.meta.url), "utf8");
  const desktopMain = await readFile(new URL("../electron/main.ts", import.meta.url), "utf8");
  assert.match(config, /appId: com\.twozach\.cycling-analytics/);
  assert.match(config, /dist\/\*\*\/\*/);
  assert.match(config, /dist-electron\/\*\*\/\*/);
  assert.match(config, /from: drizzle[\s\S]*to: drizzle/);
  assert.match(config, /cycling-analytics-icon-512\.png/);
  assert.match(config, /target: nsis/);
  assert.match(config, /target: dmg/);
  assert.match(config, /target: AppImage/);
  assert.match(config, /target: deb/);
  assert.match(config, /onlyLoadAppFromAsar: true/);
  assert.match(config, /npmRebuild: false/);
  assert.doesNotMatch(config, /server\/\*\*|tests\/\*\*/);
  assert.match(desktopMain, /CYCLING_WEB_DIR\s*=\s*path\.join\(app\.getAppPath\(\),\s*"dist"\)/);
  assert.match(desktopMain, /zoomFactor:\s*1\.1/);
  assert.doesNotMatch(desktopMain, /CYCLING_WEB_DIR\s*=\s*app\.isPackaged/);
  assert.doesNotMatch(desktopMain, /CYCLING_WEB_DIR\s*=\s*path\.join\(process\.resourcesPath,\s*"dist"\)/);
});

test("release workflow builds natively on all three operating systems", async () => {
  const workflow = await readFile(new URL("../.github/workflows/release.yml", import.meta.url), "utf8");
  assert.match(workflow, /runs-on: windows-latest/);
  assert.match(workflow, /runs-on: macos-latest/);
  assert.match(workflow, /runs-on: ubuntu-latest/);
  assert.match(workflow, /npm run dist:win/);
  assert.match(workflow, /npm run dist:mac/);
  assert.match(workflow, /npm run dist:linux/);
  assert.match(workflow, /actions\/upload-artifact@v6/);
  assert.match(workflow, /MAC_SIGNING_AVAILABLE/);
  assert.doesNotMatch(workflow, /BEGIN (?:RSA )?PRIVATE KEY|APPLE_APP_SPECIFIC_PASSWORD:\s+[^$]/);
});
