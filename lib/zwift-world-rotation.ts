import { ZWIFT_WORLDS, type ZwiftWorld } from "./zwift-routes.ts";

export const ZWIFT_ROTATION_SOURCE_URL = "https://zwiftinsider.com/schedule/";

export type ZwiftRotation = {
  date: string;
  availableWorlds: ZwiftWorld[];
  status: "live" | "fallback";
  source: "Zwift Insider world calendar";
  sourceUrl: string;
};

export type EasternDateParts = {
  year: number;
  month: number;
  day: number;
};

const monthSlugs = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const knownWorlds = new Set<string>(ZWIFT_WORLDS);

export function getEasternDateParts(date: Date): EasternDateParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  return { year: value("year"), month: value("month"), day: value("day") };
}

export function parseGuestWorldsFromSchedule(html: string, date: EasternDateParts): ZwiftWorld[] {
  const dayCell = new RegExp(
    `<td[^>]*class=["'][^"']*\\bspiffy-day-${date.day}\\b[^"']*["'][^>]*>([\\s\\S]*?)<\\/td>`,
    "i",
  ).exec(html)?.[1];
  if (!dayCell) return [];

  const worlds: ZwiftWorld[] = [];
  const titlePattern = /<span[^>]*class=["'][^"']*\bspiffy-title\b[^"']*["'][^>]*>([^<]+)<\/span>/gi;
  for (const match of dayCell.matchAll(titlePattern)) {
    const candidate = match[1].replace(/&amp;/g, "&").trim();
    if (candidate !== "Watopia" && knownWorlds.has(candidate) && !worlds.includes(candidate as ZwiftWorld)) {
      worlds.push(candidate as ZwiftWorld);
    }
  }
  return worlds;
}

export function fallbackGuestWorlds(date: EasternDateParts): ZwiftWorld[] {
  if (date.year !== 2026 || date.month !== 8) return [];
  const { day } = date;
  if (day <= 9) return ["Paris", "France"];
  if (day <= 11) return ["New York", "Makuri Islands"];
  if (day <= 13) return ["Makuri Islands", "Scotland"];
  if (day <= 15) return ["Yorkshire", "London"];
  if (day <= 17) return ["London", "Richmond"];
  if (day === 18) return ["Richmond", "Innsbruck"];
  if (day <= 20) return ["New York", "Makuri Islands"];
  if (day <= 22) return ["Makuri Islands", "Scotland"];
  if (day === 23) return ["Richmond", "Innsbruck"];
  if (day <= 25) return ["London", "Richmond"];
  if (day <= 27) return ["Yorkshire", "London"];
  if (day <= 29) return ["New York", "Makuri Islands"];
  return ["Makuri Islands", "Scotland"];
}

export async function getActiveZwiftWorlds(
  now = new Date(),
  fetcher: typeof fetch = fetch,
): Promise<ZwiftRotation> {
  const date = getEasternDateParts(now);
  const dateKey = `${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
  const sourceUrl = `${ZWIFT_ROTATION_SOURCE_URL}?grid-list-toggle=grid&month=${monthSlugs[date.month - 1]}&yr=${date.year}`;

  try {
    const response = await fetcher(sourceUrl, {
      headers: { "user-agent": "Cycling Analytics route matcher/1.0" },
      signal: AbortSignal.timeout(6_000),
    });
    if (!response.ok) throw new Error(`Schedule returned ${response.status}`);
    const guestWorlds = parseGuestWorldsFromSchedule(await response.text(), date);
    if (!guestWorlds.length) throw new Error("No guest worlds found for today");
    return {
      date: dateKey,
      availableWorlds: ["Watopia", ...guestWorlds],
      status: "live",
      source: "Zwift Insider world calendar",
      sourceUrl,
    };
  } catch {
    return {
      date: dateKey,
      availableWorlds: ["Watopia", ...fallbackGuestWorlds(date)],
      status: "fallback",
      source: "Zwift Insider world calendar",
      sourceUrl,
    };
  }
}
