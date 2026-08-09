import { and, eq } from "drizzle-orm";
import { getDb } from "../../db";
import { externalConnections } from "../../db/schema";
import { currentRider } from "../../lib/current-rider";
import { getSecretStore, STRAVA_SECRETS } from "../platform/secret-store";

export async function GET(request: Request) {
  void request;
  const store = getSecretStore();
  const [clientId, clientSecret] = await Promise.all([
    store.get(STRAVA_SECRETS.clientId),
    store.get(STRAVA_SECRETS.clientSecret),
  ]);
  return Response.json({
    configured: Boolean(clientId && clientSecret),
    clientId,
    storage: "owner-only-file",
  });
}

export async function PUT(request: Request) {
  const payload = await request.json() as { clientId?: unknown; clientSecret?: unknown };
  const clientId = typeof payload.clientId === "string" ? payload.clientId.trim() : "";
  const clientSecret = typeof payload.clientSecret === "string" ? payload.clientSecret.trim() : "";
  if (!clientId || !clientSecret) {
    return Response.json({ error: "Both the Strava client ID and client secret are required." }, { status: 400 });
  }
  if (clientId.length > 64 || clientSecret.length > 256) {
    return Response.json({ error: "The Strava credentials are longer than expected." }, { status: 400 });
  }

  const store = getSecretStore();
  await Promise.all([
    store.set(STRAVA_SECRETS.clientId, clientId),
    store.set(STRAVA_SECRETS.clientSecret, clientSecret),
  ]);
  return Response.json({ configured: true, clientId, storage: "owner-only-file" });
}

export async function DELETE(request: Request) {
  const rider = await currentRider(request);
  const store = getSecretStore();
  await Promise.all(Object.values(STRAVA_SECRETS).map((name) => store.delete(name)));
  await getDb().delete(externalConnections).where(and(
    eq(externalConnections.riderId, rider.id),
    eq(externalConnections.provider, "strava"),
  ));
  return Response.json({ configured: false, disconnected: true });
}
