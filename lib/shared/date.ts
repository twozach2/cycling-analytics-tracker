/**
 * Returns a YYYY-MM-DD key in the computer's local timezone. This is
 * intentional for the local-first app; a remotely hosted runtime must pass an
 * explicit rider timezone instead of relying on the server's local timezone.
 */
export function localDayKey(value: string | Date) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
