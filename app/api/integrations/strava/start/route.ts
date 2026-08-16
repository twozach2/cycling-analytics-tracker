import { getDb } from "../../../../../db";
import { oauthStates, riders } from "../../../../../db/schema";
import { currentRider } from "../../../../../lib/current-rider";
import { getSecretStore, STRAVA_SECRETS } from "../../../../../server/platform/secret-store";

export async function GET(request: Request) {
  const rider = await currentRider(request);
  if (!rider) return Response.json({ error: "Sign in before connecting Strava." }, { status: 401 });
  const store = getSecretStore();
  const [clientId, clientSecret] = await Promise.all([
    store.get(STRAVA_SECRETS.clientId),
    store.get(STRAVA_SECRETS.clientSecret),
  ]);
  if (!clientId || !clientSecret) {
    return Response.redirect(new URL("/?integration=strava-setup", request.url), 302);
  }

  const db = getDb();
  await db.insert(riders).values({ id: rider.id, displayName: rider.name }).onConflictDoNothing();
  const state = crypto.randomUUID();
  await db.insert(oauthStates).values({
    state,
    riderId: rider.id,
    provider: "strava",
    expiresAt: Math.floor(Date.now() / 1000) + 600,
  });

  const authorize = new URL("https://www.strava.com/oauth/authorize");
  authorize.searchParams.set("client_id", clientId);
  authorize.searchParams.set("redirect_uri", new URL("/api/integrations/strava/callback", request.url).toString());
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("approval_prompt", "auto");
  authorize.searchParams.set("scope", "read,activity:read_all");
  authorize.searchParams.set("state", state);
  return Response.redirect(authorize, 302);
}
