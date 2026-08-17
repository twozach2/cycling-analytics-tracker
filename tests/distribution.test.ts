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
  assert.match(config, /from: resources\/brouter[\s\S]*to: brouter/);
  assert.match(config, /target: nsis/);
  assert.match(config, /target: dmg/);
  assert.match(config, /target: AppImage/);
  assert.match(config, /target: deb/);
  assert.match(config, /onlyLoadAppFromAsar: true/);
  assert.match(config, /npmRebuild: false/);
  assert.doesNotMatch(config, /server\/\*\*|tests\/\*\*/);
  assert.match(desktopMain, /CYCLING_WEB_DIR\s*=\s*path\.join\(app\.getAppPath\(\),\s*"dist"\)/);
  assert.match(desktopMain, /zoomFactor:\s*1\.1/);
  assert.match(desktopMain, /startBundledBRouter/);
  assert.match(desktopMain, /CYCLING_BROUTER_URL/);
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
  assert.equal((workflow.match(/npm run prepare:brouter-runtime/g) ?? []).length, 3);
  assert.equal((workflow.match(/actions\/setup-java@v4/g) ?? []).length, 3);
  assert.match(workflow, /actions\/upload-artifact@v6/);
  assert.match(workflow, /MAC_SIGNING_AVAILABLE/);
  assert.doesNotMatch(workflow, /BEGIN (?:RSA )?PRIVATE KEY|APPLE_APP_SPECIFIC_PASSWORD:\s+[^$]/);
});

test("persistent browser preview uses isolated data and ports", async () => {
  const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8")) as {
    scripts: Record<string, string>;
  };
  const viteConfig = await readFile(new URL("../vite.config.ts", import.meta.url), "utf8");
  const launcher = await readFile(new URL("../scripts/start-web-preview.ts", import.meta.url), "utf8");
  const shortcutInstaller = await readFile(new URL("../scripts/install-web-preview-shortcut.ps1", import.meta.url), "utf8");

  assert.equal(packageJson.scripts["preview:web"], "tsx scripts/start-web-preview.ts");
  assert.match(packageJson.scripts["dev:preview:services"], /--strictPort/);
  assert.match(viteConfig, /CYCLING_API_PORT/);
  assert.match(launcher, /CyclingAnalyticsPreview/);
  assert.match(launcher, /previewApiPort = 8723/);
  assert.match(launcher, /CYCLING_DATA_DIR: previewDataDirectory/);
  assert.match(launcher, /isCyclingPreviewReady/);
  assert.match(launcher, /startBundledBRouter/);
  assert.match(launcher, /CYCLING_BROUTER_URL: brouterSidecar\.baseUrl/);
  assert.match(packageJson.scripts["preview:install-shortcut"], /install-web-preview-shortcut\.ps1/);
  assert.match(launcher, /seedPreviewFromDesktop/);
  assert.doesNotMatch(launcher, /secrets\.json/);
  assert.match(shortcutInstaller, /Cycling Analytics Preview\.lnk/);
  assert.match(shortcutInstaller, /npm\.cmd run preview:web/);
});
