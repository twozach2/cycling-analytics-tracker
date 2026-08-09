export type RuntimeConfig = {
  STRAVA_CLIENT_ID?: string;
  STRAVA_CLIENT_SECRET?: string;
};

export function runtimeConfig(): RuntimeConfig {
  return {
    STRAVA_CLIENT_ID: process.env.STRAVA_CLIENT_ID?.trim() || undefined,
    STRAVA_CLIENT_SECRET: process.env.STRAVA_CLIENT_SECRET?.trim() || undefined,
  };
}
