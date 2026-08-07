import { and, eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getDb } from "../../../../../db";
import { externalConnections } from "../../../../../db/schema";
import { currentRider } from "../../../../../lib/current-rider";

export async function POST(request: Request) {
  const rider = await currentRider(request);
  if (!rider) return Response.json({ error: "Sign in to disconnect Strava." }, { status: 401 });
  const db = getDb();
  const [connection] = await db.select().from(externalConnections)
    .where(and(eq(externalConnections.riderId, rider.id), eq(externalConnections.provider, "strava")))
    .limit(1);
  if (!connection) return Response.json({ disconnected: true });
  const config = env as unknown as Record<string, string | undefined>;
  if (connection.refreshToken && config.STRAVA_CLIENT_ID && config.STRAVA_CLIENT_SECRET) {
    const basic = btoa(`${config.STRAVA_CLIENT_ID}:${config.STRAVA_CLIENT_SECRET}`);
    const response = await fetch("https://www.strava.com/oauth/revoke", {
      method: "POST",
      headers: { authorization: `Basic ${basic}`, "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: connection.refreshToken, token_type_hint: "refresh_token" }),
    });
    if (!response.ok) return Response.json({ error: "Strava access could not be revoked. Try again shortly." }, { status: 502 });
  }
  await db.delete(externalConnections).where(eq(externalConnections.id, connection.id));
  return Response.json({ disconnected: true });
}
