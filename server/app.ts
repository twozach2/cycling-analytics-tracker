import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import * as importRoute from "../app/api/import/route";
import * as stravaCallbackRoute from "../app/api/integrations/strava/callback/route";
import * as stravaDisconnectRoute from "../app/api/integrations/strava/disconnect/route";
import * as stravaStartRoute from "../app/api/integrations/strava/start/route";
import * as stravaSyncRoute from "../app/api/integrations/strava/sync/route";
import * as phaseThreeRoute from "../app/api/phase3/route";
import * as recoveryRoute from "../app/api/recovery/route";
import * as rideIdeasRoute from "../app/api/ride-ideas/route";
import * as ridesRoute from "../app/api/rides/route";
import * as zwiftWorldsRoute from "../app/api/zwift/worlds/route";
import * as outdoorRoutesRoute from "./routes/outdoor-routes";
import * as stravaSettingsRoute from "./routes/strava-settings";
import * as oauthCompleteRoute from "./routes/oauth-complete";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const webRoot = process.env.CYCLING_WEB_DIR?.trim()
  ? path.resolve(process.env.CYCLING_WEB_DIR)
  : path.join(projectRoot, "dist");

type RequestHandler = (request: Request) => Response | Promise<Response>;

function handle(handler: RequestHandler) {
  return (context: { req: { raw: Request } }) => handler(context.req.raw);
}

const SECURITY_HEADERS = {
  "Content-Security-Policy": [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self'",
    "connect-src 'self'",
  ].join("; "),
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
} as const;

export function createApp() {
  const app = new Hono();

  app.use("*", async (context, next) => {
    await next();
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      if (!context.res.headers.has(name)) context.header(name, value);
    }
  });

  app.get("/api/health", (context) => context.json({ status: "ok", mode: "local" }));
  app.get("/api/rides", handle(ridesRoute.GET));
  app.post("/api/rides", handle(ridesRoute.POST));
  app.patch("/api/rides", handle(ridesRoute.PATCH));
  app.get("/api/recovery", handle(recoveryRoute.GET));
  app.post("/api/recovery", handle(recoveryRoute.POST));
  app.get("/api/ride-ideas", handle(rideIdeasRoute.GET));
  app.post("/api/ride-ideas", handle(rideIdeasRoute.POST));
  app.post("/api/import", handle(importRoute.POST));
  app.get("/api/phase3", handle(phaseThreeRoute.GET));
  app.post("/api/phase3", handle(phaseThreeRoute.POST));
  app.get("/api/zwift/worlds", handle(zwiftWorldsRoute.GET));
  app.get("/api/routes/outdoor", handle(outdoorRoutesRoute.GET));
  app.post("/api/routes/outdoor", handle(outdoorRoutesRoute.POST));
  app.get("/api/integrations/strava/start", handle(stravaStartRoute.GET));
  app.get("/api/integrations/strava/callback", handle(stravaCallbackRoute.GET));
  app.post("/api/integrations/strava/sync", handle(stravaSyncRoute.POST));
  app.post("/api/integrations/strava/disconnect", handle(stravaDisconnectRoute.POST));
  app.get("/api/settings/strava", handle(stravaSettingsRoute.GET));
  app.put("/api/settings/strava", handle(stravaSettingsRoute.PUT));
  app.delete("/api/settings/strava", handle(stravaSettingsRoute.DELETE));
  app.get("/oauth/strava/complete", handle(oauthCompleteRoute.GET));

  app.use("*", serveStatic({ root: webRoot }));
  app.get("*", async (context) => {
    const html = await readFile(path.join(webRoot, "index.html"), "utf8");
    return context.html(html);
  });

  app.onError((error, context) => {
    console.error(error);
    return context.json({ error: "The local service could not complete that request." }, 500);
  });

  return app;
}
