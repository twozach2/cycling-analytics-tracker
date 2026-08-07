import { and, eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../../chatgpt-auth";
import { getDb } from "../../../db";
import { riders, sourceFiles } from "../../../db/schema";

const MAX_FILE_BYTES = 25 * 1024 * 1024;
const allowedExtensions = new Set(["fit", "tcx", "gpx"]);

function bytesToHex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function currentRiderId(request: Request) {
  const user = await getChatGPTUser();
  if (user) return { id: user.userId, name: user.displayName };
  const hostname = new URL(request.url).hostname;
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return { id: "local-rider", name: "Local rider" };
  }
  return null;
}

export async function POST(request: Request) {
  const rider = await currentRiderId(request);
  if (!rider) return Response.json({ error: "Sign in to import activity files." }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) return Response.json({ error: "An activity file is required." }, { status: 400 });
  if (file.size <= 0 || file.size > MAX_FILE_BYTES) {
    return Response.json({ error: "Activity files must be between 1 byte and 25 MB." }, { status: 400 });
  }
  const extension = file.name.split(".").at(-1)?.toLowerCase() ?? "unknown";
  if (!allowedExtensions.has(extension)) {
    return Response.json({ error: "Only FIT, TCX, and GPX activity files are supported." }, { status: 400 });
  }

  const bytes = await file.arrayBuffer();
  const sha256 = bytesToHex(await crypto.subtle.digest("SHA-256", bytes));
  const r2Key = `${rider.id}/${sha256}.${extension}`;
  const fileStore = (env as unknown as { RIDE_FILES: R2Bucket }).RIDE_FILES;
  await fileStore.put(r2Key, bytes, {
    httpMetadata: { contentType: file.type || "application/octet-stream" },
    customMetadata: { originalFilename: file.name, sha256 },
  });

  const db = getDb();
  await db.insert(riders).values({ id: rider.id, displayName: rider.name }).onConflictDoNothing();
  const id = crypto.randomUUID();
  await db.insert(sourceFiles).values({
    id,
    riderId: rider.id,
    filename: file.name,
    fileType: extension as "fit" | "tcx" | "gpx",
    sha256,
    r2Key,
    byteSize: file.size,
    importStatus: "parsed",
  }).onConflictDoNothing();

  const [stored] = await db
    .select({ id: sourceFiles.id, filename: sourceFiles.filename, sha256: sourceFiles.sha256 })
    .from(sourceFiles)
    .where(and(eq(sourceFiles.riderId, rider.id), eq(sourceFiles.sha256, sha256)))
    .limit(1);
  return Response.json({ sourceFile: stored, duplicate: stored?.id !== id }, { status: 201 });
}
