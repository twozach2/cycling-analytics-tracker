import { execFileSync } from "node:child_process";
import { cp, copyFile, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BROUTER_VERSION = "v1.7.10";
const BROUTER_COMMIT = "4d2639af77ea5ed9c30d3e400764eb6f9e8522da";
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const option = (name, fallback) => {
  const inline = process.argv.find((argument) => argument.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
};
const javaHome = option("--java-home", process.env.JAVA_HOME);
const commandEnvironment = javaHome ? { ...process.env, JAVA_HOME: path.resolve(javaHome), PATH: `${path.resolve(javaHome, "bin")}${path.delimiter}${process.env.PATH ?? ""}` } : process.env;
const needsShell = (command) => process.platform === "win32" && command.toLowerCase().endsWith(".bat");
const run = (command, args, cwd) => execFileSync(command, args, { cwd, env: commandEnvironment, stdio: "inherit", shell: needsShell(command) });
const output = (command, args, cwd) => execFileSync(command, args, { cwd, env: commandEnvironment, encoding: "utf8", shell: needsShell(command) }).trim();

const sourceDirectory = path.resolve(option("--source-dir", path.join(os.tmpdir(), `cycling-brouter-${BROUTER_VERSION}`)));
const outputDirectory = path.resolve(option("--output-dir", path.join(projectRoot, "resources", "brouter")));
try {
  await readFile(path.join(sourceDirectory, ".git", "HEAD"));
} catch {
  await mkdir(path.dirname(sourceDirectory), { recursive: true });
  run("git", ["clone", "--depth", "1", "--branch", BROUTER_VERSION, "https://github.com/abrensch/brouter.git", sourceDirectory], projectRoot);
}
const commit = output("git", ["rev-parse", "HEAD"], sourceDirectory);
if (commit !== BROUTER_COMMIT) throw new Error(`Expected BRouter ${BROUTER_COMMIT}, found ${commit}.`);

const gradle = path.join(sourceDirectory, process.platform === "win32" ? "gradlew.bat" : "gradlew");
run(gradle, [":brouter-server:fatJar", "--no-daemon"], sourceDirectory);
const jarDirectory = path.join(sourceDirectory, "brouter-server", "build", "libs");
const jarName = (await readdir(jarDirectory)).find((name) => name.endsWith("-all.jar"));
if (!jarName) throw new Error("The pinned BRouter build did not produce a fat server JAR.");

await mkdir(outputDirectory, { recursive: true });
for (const target of ["runtime", "profiles2", "brouter-server.jar", "LICENSE-BRouter.txt", "runtime-manifest.json"]) {
  await rm(path.join(outputDirectory, target), { recursive: true, force: true });
}
await copyFile(path.join(jarDirectory, jarName), path.join(outputDirectory, "brouter-server.jar"));
await cp(path.join(sourceDirectory, "misc", "profiles2"), path.join(outputDirectory, "profiles2"), { recursive: true });
await copyFile(path.join(sourceDirectory, "LICENSE"), path.join(outputDirectory, "LICENSE-BRouter.txt"));

run(javaHome ? path.join(path.resolve(javaHome), "bin", process.platform === "win32" ? "jlink.exe" : "jlink") : "jlink", [
  "--add-modules", "java.base,java.logging,java.xml,jdk.unsupported",
  "--strip-debug", "--no-header-files", "--no-man-pages", "--compress=2",
  "--output", path.join(outputDirectory, "runtime"),
], projectRoot);
await writeFile(path.join(outputDirectory, "runtime-manifest.json"), `${JSON.stringify({
  brouterVersion: BROUTER_VERSION,
  brouterCommit: BROUTER_COMMIT,
  platform: process.platform,
  architecture: process.arch,
  generatedAt: new Date().toISOString(),
}, null, 2)}\n`, "utf8");
console.log(`Prepared BRouter ${BROUTER_VERSION} runtime at ${outputDirectory}`);
