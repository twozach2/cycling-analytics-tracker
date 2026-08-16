const RESULTS = {
  "strava-connected": ["Strava connected", "Your Strava account is connected. You can close this tab and return to Cycling Analytics."],
  "strava-denied": ["Connection cancelled", "Strava access was not granted. You can close this tab and try again from Cycling Analytics."],
  "strava-invalid": ["Connection could not be verified", "The callback was incomplete. Close this tab and try connecting again."],
  "strava-scope": ["Activity permission required", "Cycling Analytics needs permission to read activities. Close this tab and reconnect with activity access."],
  "strava-expired": ["Connection expired", "The authorization attempt took too long. Close this tab and start again from Cycling Analytics."],
  "strava-setup": ["Strava setup incomplete", "The local Strava application credentials are missing. Return to Cycling Analytics and save them first."],
  "strava-failed": ["Strava connection failed", "Strava could not complete the connection. Close this tab and try again."],
} as const;

export function GET(request: Request) {
  const requested = new URL(request.url).searchParams.get("status") ?? "strava-failed";
  const [title, message] = RESULTS[requested as keyof typeof RESULTS] ?? RESULTS["strava-failed"];
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>${title}</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#171a16;color:#f4f6ef;font:16px system-ui,sans-serif}.card{max-width:34rem;margin:2rem;padding:2rem;border:1px solid #465044;border-radius:18px;background:#20251f}h1{margin-top:0;color:#d8ff65}p{line-height:1.6;color:#cbd1c5}</style></head><body><main class="card"><h1>${title}</h1><p>${message}</p></main></body></html>`;
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'",
    },
  });
}
