import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { bundledBRouterPaths, startBundledBRouter } from "../electron/brouter-sidecar.ts";

test("bundled BRouter paths use the native Java executable and fixed resource layout", () => {
  assert.deepEqual(bundledBRouterPaths("/resources", "linux"), {
    javaExecutable: path.join("/resources", "brouter", "runtime", "bin", "java"),
    jarPath: path.join("/resources", "brouter", "brouter-server.jar"),
    profileDirectory: path.join("/resources", "brouter", "profiles2"),
  });
  assert.equal(bundledBRouterPaths("C:\\resources", "win32").javaExecutable, path.join("C:\\resources", "brouter", "runtime", "bin", "java.exe"));
});

test("desktop startup keeps outdoor routing optional when no bundle is packaged", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "cycling-no-brouter-"));
  try {
    assert.equal(await startBundledBRouter({
      resourceRoot: directory,
      segmentDirectory: path.join(directory, "segments"),
      customProfileDirectory: path.join(directory, "customprofiles"),
    }), null);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
