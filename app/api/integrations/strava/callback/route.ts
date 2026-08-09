import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { externalConnections, oauthStates } from "../../../../../db/schema";
import { currentRider } from "../../../../../lib/current-rider";
import { getSecretStore, STRAVA_SECRETS } from "../../../../../server/platform/secret-store";

type StravaTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_at?: number;
  scope?: string;
  athlete?: { id?: number; firstname?: string; lastname?: string; username?: string };
  message?: string;
};

export async function GET(request: Request) {
  const rider = await currentRider(request);
  if (!rider) return Response.json({ error: "Sign in before connecting Strava." }, { status: 401 });
  const url = new URL(request.url);
  if (url.searchParams.get("error")) return Response.redirect(new URL("/?integration=strava-denied", request.url), 302);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const grantedScopes = url.searchParams.get("scope") ?? "";
  if (!code || !state) return Response.redirect(new URL("/?integration=strava-invalid", request.url), 302);
  if (!grantedScopes.split(/[,\s]+/).some((scope) => scope === "activity:read" || scope === "activity:read_all")) {
    return Response.redirect(new URL("/?integration=strava-scope", request.url), 302);
  }

  const db = getDb();
  const [storedState] = await db.select().from(oauthStates)
    .where(and(eq(oauthStates.state, state), eq(oauthStates.riderId, rider.id), eq(oauthStates.provider, "strava")))
    .limit(1);
  await db.delete(oauthStates).where(eq(oauthStates.state, state));
  if (!storedState || storedState.expiresAt < Math.floor(Date.now() / 1000)) {
    return Response.redirect(new URL("/?integration=strava-expired", request.url), 302);
  }

  const secretStore = getSecretStore();
  const [clientId, clientSecret] = await Promise.all([
    secretStore.get(STRAVA_SECRETS.clientId),
    secretStore.get(STRAVA_SECRETS.clientSecret),
  ]);
  if (!clientId || !clientSecret) {
    return Response.redirect(new URL("/?integration=strava-setup", request.url), 302);
  }
  const tokenResponse = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
    }),
  });
  const token = await tokenResponse.json() as StravaTokenResponse;
  if (!tokenResponse.ok || !token.access_token || !token.refresh_token || !token.expires_at) {
    return Response.redirect(new URL("/?integration=strava-failed", request.url), 302);
  }
  await Promise.all([
    secretStore.set(STRAVA_SECRETS.accessToken, token.access_token),
    secretStore.set(STRAVA_SECRETS.refreshToken, token.refresh_token),
  ]);
  const athleteName = [token.athlete?.firstname, token.athlete?.lastname].filter(Boolean).join(" ") || token.athlete?.username || "Connected athlete";
  const now = new Date().toISOString();
  await db.insert(externalConnections).values({
    id: crypto.randomUUID(),
    riderId: rider.id,
    provider: "strava",
    externalAthleteId: token.athlete?.id ? String(token.athlete.id) : null,
    displayName: athleteName,
    expiresAt: token.expires_at,
    scopes: token.scope ?? grantedScopes.replaceAll(",", " "),
    updatedAt: now,
  }).onConflictDoUpdate({
    target: [externalConnections.riderId, externalConnections.provider],
    set: {
      externalAthleteId: token.athlete?.id ? String(token.athlete.id) : null,
      displayName: athleteName,
      expiresAt: token.expires_at,
      scopes: token.scope ?? grantedScopes.replaceAll(",", " "),
      updatedAt: now,
    },
  });
  return Response.redirect(new URL("/?integration=strava-connected", request.url), 302);
}
