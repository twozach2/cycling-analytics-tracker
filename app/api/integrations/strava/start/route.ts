import { env } from "cloudflare:workers";
import { getDb } from "../../../../../db";
import { oauthStates, riders } from "../../../../../db/schema";
import { currentRider } from "../../../../../lib/current-rider";

export async function GET(request: Request) {
  const rider = await currentRider(request);
  if (!rider) return Response.json({ error: "Sign in before connecting Strava." }, { status: 401 });
  const config = env as unknown as Record<string, string | undefined>;
  if (!config.STRAVA_CLIENT_ID || !config.STRAVA_CLIENT_SECRET) {
    return Response.redirect(new URL("/?integration=strava-setup", request.url), 302);
  }

  const db = getDb();
  await db.insert(riders).values({ id: rider.id, displayName: rider.name, defaultFtpWatts: 165 }).onConflictDoNothing();
  const state = crypto.randomUUID();
  await db.insert(oauthStates).values({
    state,
    riderId: rider.id,
    provider: "strava",
    expiresAt: Math.floor(Date.now() / 1000) + 600,
  });

  const authorize = new URL("https://www.strava.com/oauth/authorize");
  authorize.searchParams.set("client_id", config.STRAVA_CLIENT_ID);
  authorize.searchParams.set("redirect_uri", new URL("/api/integrations/strava/callback", request.url).toString());
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("approval_prompt", "auto");
  authorize.searchParams.set("scope", "read,activity:read_all");
  authorize.searchParams.set("state", state);
  return Response.redirect(authorize, 302);
}
