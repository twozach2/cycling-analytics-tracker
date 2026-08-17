import { spawn, type ChildProcess } from "node:child_process";
import { access, mkdir } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { brouterJavaExecutable, brouterLaunchArguments } from "../server/services/brouter";

export type BundledBRouterPaths = {
  javaExecutable: string;
  jarPath: string;
  profileDirectory: string;
};

export type BRouterSidecar = {
  baseUrl: string;
  port: number;
  stop: () => void;
};

export function bundledBRouterPaths(resourceRoot: string, platform: NodeJS.Platform = process.platform): BundledBRouterPaths {
  const bundle = path.join(resourceRoot, "brouter");
  return {
    javaExecutable: brouterJavaExecutable(path.join(bundle, "runtime"), platform),
    jarPath: path.join(bundle, "brouter-server.jar"),
    profileDirectory: path.join(bundle, "profiles2"),
  };
}

async function bundleExists(paths: BundledBRouterPaths) {
  try {
    await Promise.all([access(paths.javaExecutable), access(paths.jarPath), access(paths.profileDirectory)]);
    return true;
  } catch {
    return false;
  }
}

async function availableLoopbackPort() {
  return new Promise<number>((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("A local BRouter port could not be reserved."));
        return;
      }
      server.close((error) => error ? reject(error) : resolve(address.port));
    });
  });
}

async function canConnect(port: number) {
  return new Promise<boolean>((resolve) => {
    const socket = net.createConnection({ host: "127.0.0.1", port });
    socket.once("connect", () => { socket.destroy(); resolve(true); });
    socket.once("error", () => resolve(false));
    socket.setTimeout(400, () => { socket.destroy(); resolve(false); });
  });
}

async function waitForReady(process_: ChildProcess, port: number, errorText: () => string, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (process_.exitCode !== null) throw new Error(`BRouter exited before startup (${process_.exitCode}). ${errorText()}`.trim());
    if (await canConnect(port)) return;
    await new Promise((resolve) => setTimeout(resolve, 60));
  }
  throw new Error(`BRouter did not start within ${timeoutMs} ms. ${errorText()}`.trim());
}

export async function startBundledBRouter(options: {
  resourceRoot: string;
  segmentDirectory: string;
  customProfileDirectory: string;
  platform?: NodeJS.Platform;
}): Promise<BRouterSidecar | null> {
  const paths = bundledBRouterPaths(options.resourceRoot, options.platform);
  if (!await bundleExists(paths)) return null;
  await Promise.all([
    mkdir(options.segmentDirectory, { recursive: true }),
    mkdir(options.customProfileDirectory, { recursive: true }),
  ]);
  const port = await availableLoopbackPort();
  const arguments_ = brouterLaunchArguments({
    jarPath: paths.jarPath,
    segmentDirectory: options.segmentDirectory,
    profileDirectory: paths.profileDirectory,
    customProfileDirectory: options.customProfileDirectory,
    port,
  });
  const process_ = spawn(paths.javaExecutable, arguments_, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  let stopping = false;
  let stderr = "";
  const spawnFailure = new Promise<never>((_resolve, reject) => process_.once("error", reject));
  process_.on("error", (error) => { if (!stopping) console.error("BRouter sidecar error:", error); });
  process_.stderr.setEncoding("utf8");
  process_.stderr.on("data", (chunk: string) => { stderr = `${stderr}${chunk}`.slice(-4_000); });
  try {
    await Promise.race([waitForReady(process_, port, () => stderr), spawnFailure]);
  } catch (error) {
    stopping = true;
    process_.kill();
    throw error;
  }
  process_.once("exit", (code) => { if (!stopping && code !== 0) console.error(`BRouter sidecar exited with code ${code}. ${stderr}`); });
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    port,
    stop: () => {
      stopping = true;
      if (process_.exitCode === null) process_.kill();
    },
  };
}
