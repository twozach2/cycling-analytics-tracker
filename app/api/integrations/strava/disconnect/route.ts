import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { externalConnections } from "../../../../../db/schema";
import { currentRider } from "../../../../../lib/current-rider";
import { getSecretStore, STRAVA_SECRETS } from "../../../../../server/platform/secret-store";

export async function POST(request: Request) {
  const rider = await currentRider(request);
  if (!rider) return Response.json({ error: "Sign in to disconnect Strava." }, { status: 401 });
  const db = getDb();
  const [connection] = await db.select().from(externalConnections)
    .where(and(eq(externalConnections.riderId, rider.id), eq(externalConnections.provider, "strava")))
    .limit(1);
  const secretStore = getSecretStore();
  const [clientId, clientSecret, refreshToken] = await Promise.all([
    secretStore.get(STRAVA_SECRETS.clientId),
    secretStore.get(STRAVA_SECRETS.clientSecret),
    secretStore.get(STRAVA_SECRETS.refreshToken),
  ]);
  if (connection && refreshToken && clientId && clientSecret) {
    const basic = btoa(`${clientId}:${clientSecret}`);
    const response = await fetch("https://www.strava.com/oauth/revoke", {
      method: "POST",
      headers: { authorization: `Basic ${basic}`, "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: refreshToken, token_type_hint: "refresh_token" }),
    });
    if (!response.ok) return Response.json({ error: "Strava access could not be revoked. Try again shortly." }, { status: 502 });
  }
  if (connection) await db.delete(externalConnections).where(eq(externalConnections.id, connection.id));
  await Promise.all(Object.values(STRAVA_SECRETS).map((name) => secretStore.delete(name)));
  return Response.json({ disconnected: true });
}
