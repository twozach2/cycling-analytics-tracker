import { getActiveZwiftWorlds } from "../../../../lib/zwift-world-rotation";

export async function GET() {
  const rotation = await getActiveZwiftWorlds();
  return Response.json(rotation, {
    headers: {
      "cache-control": "public, max-age=1800, s-maxage=21600, stale-while-revalidate=86400",
    },
  });
}
