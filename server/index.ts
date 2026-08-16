import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { closeDb, getDb } from "./platform/db";
import { loadEnvironmentFiles } from "./platform/load-environment";

loadEnvironmentFiles();

export const DEFAULT_PORT = 8722;
export const DEFAULT_HOST = "127.0.0.1";

export function startServer(port = Number(process.env.PORT) || DEFAULT_PORT) {
  getDb();
  return serve({ fetch: createApp().fetch, hostname: DEFAULT_HOST, port });
}

const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
const isEntryPoint = entryPath === fileURLToPath(import.meta.url);

if (isEntryPoint) {
  const port = Number(process.env.PORT) || DEFAULT_PORT;
  const server = startServer(port);
  console.log(`Cycling Analytics is available at http://${DEFAULT_HOST}:${port}`);

  const shutdown = () => server.close(() => {
    closeDb();
    process.exit(0);
  });
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}
