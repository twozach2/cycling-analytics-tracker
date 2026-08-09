export const LOCAL_APP_ORIGIN = "http://127.0.0.1:8722";

const TRUSTED_EXTERNAL_HOSTS = new Set([
  "strava.com",
  "www.strava.com",
  "developer.garmin.com",
]);

export function isLocalAppUrl(candidate: string) {
  try {
    return new URL(candidate).origin === LOCAL_APP_ORIGIN;
  } catch {
    return false;
  }
}

export function isTrustedExternalUrl(candidate: string) {
  try {
    const url = new URL(candidate);
    return url.protocol === "https:" && TRUSTED_EXTERNAL_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}
