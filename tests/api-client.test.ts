import assert from "node:assert/strict";
import test from "node:test";
import { ApiRequestError, requestJson, type FetchLike } from "../lib/api-client";
import { saveThenRefresh } from "../lib/import-transaction";

const responding = (response: Response): FetchLike => async () => response;

test("requestJson returns typed JSON and preserves API error messages", async () => {
  const payload = await requestJson<{ value: number }>(
    "/api/example",
    {},
    "Fallback",
    responding(new Response(JSON.stringify({ value: 42 }), { status: 200 })),
  );
  assert.equal(payload.value, 42);

  await assert.rejects(
    requestJson(
      "/api/example",
      {},
      "Fallback",
      responding(new Response(JSON.stringify({ error: "Specific problem" }), { status: 422 })),
    ),
    (error: unknown) => {
      assert.ok(error instanceof ApiRequestError);
      assert.equal(error.message, "Specific problem");
      assert.equal(error.status, 422);
      return true;
    },
  );
});

test("requestJson uses a safe fallback for malformed error responses", async () => {
  await assert.rejects(
    requestJson(
      "/api/example",
      {},
      "Could not load the example.",
      responding(new Response("<html>failure</html>", { status: 500 })),
    ),
    /Could not load the example/,
  );
});

test("saveThenRefresh distinguishes a committed save from a failed reload", async () => {
  const result = await saveThenRefresh(
    async () => ({ rideId: "ride-1" }),
    async () => { throw new Error("Reload unavailable"); },
  );

  assert.equal(result.status, "saved_refresh_failed");
  assert.equal(result.saved.rideId, "ride-1");
  if (result.status === "saved_refresh_failed") assert.match(result.refreshError.message, /Reload unavailable/);
});

test("saveThenRefresh still rejects when persistence itself fails", async () => {
  await assert.rejects(
    saveThenRefresh(
      async () => { throw new Error("Save unavailable"); },
      async () => ["should not run"],
    ),
    /Save unavailable/,
  );
});
