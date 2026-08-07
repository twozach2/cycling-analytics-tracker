import type { WorkoutMode } from "./phase3";

export type RouteCommitment = 30 | 60 | 90;

export const ZWIFT_WORLDS = [
  "Watopia",
  "France",
  "Innsbruck",
  "London",
  "Makuri Islands",
  "New York",
  "Paris",
  "Richmond",
  "Scotland",
  "Yorkshire",
] as const;

export type ZwiftWorld = (typeof ZWIFT_WORLDS)[number];

export type ZwiftRoute = {
  id: string;
  name: string;
  world: ZwiftWorld;
  distanceMiles: number;
  elevationFeet: number;
  badgeXp: number;
  profile: "flat" | "rolling" | "climb";
};

export type ZwiftRouteSuggestion = {
  commitment: RouteCommitment;
  route: ZwiftRoute;
  targetWatts: string;
  heartRateCue: string;
  reason: string;
  timingCue: string;
  recommended: boolean;
  disabled: boolean;
};

const route = (
  id: string,
  name: string,
  world: ZwiftWorld,
  distanceMiles: number,
  elevationFeet: number,
  badgeXp: number,
  profile: ZwiftRoute["profile"],
): ZwiftRoute => ({ id, name, world, distanceMiles, elevationFeet, badgeXp, profile });

const routes: Record<string, ZwiftRoute> = {
  "volcano-circuit": route("volcano-circuit", "Volcano Circuit", "Watopia", 3.3, 91, 80, "flat"),
  "volcano-flat": route("volcano-flat", "Volcano Flat", "Watopia", 7.8, 167, 240, "flat"),
  "tempus-fugit": route("tempus-fugit", "Tempus Fugit", "Watopia", 12.2, 105, 380, "flat"),
  "beach-island-loop": route("beach-island-loop", "Beach Island Loop", "Watopia", 8, 160, 255, "flat"),
  "tick-tock": route("tick-tock", "Tick Tock", "Watopia", 12, 194, 380, "flat"),
  "big-flat-8": route("big-flat-8", "Big Flat 8", "Watopia", 18.1, 338, 580, "rolling"),
  "hilly-route": route("hilly-route", "Hilly Route", "Watopia", 5.8, 359, 180, "rolling"),
  "volcano-climb": route("volcano-climb", "Volcano Climb", "Watopia", 14.3, 669, 460, "climb"),
  "triple-flat-loops": route("triple-flat-loops", "Triple Flat Loops", "Watopia", 21.1, 514, 680, "rolling"),

  "france-croissant": route("france-croissant", "Croissant", "France", 7.7, 230, 185, "flat"),
  "france-douce-france": route("france-douce-france", "Douce France", "France", 15.4, 446, 465, "rolling"),
  "france-three-musketeers": route("france-three-musketeers", "Three Musketeers", "France", 22.2, 656, 705, "rolling"),

  "innsbruck-innsbruckring": route("innsbruck-innsbruckring", "Innsbruckring", "Innsbruck", 5.7, 256, 170, "rolling"),
  "innsbruck-2018-worlds-short-lap": route("innsbruck-2018-worlds-short-lap", "2018 Worlds Short Lap", "Innsbruck", 14.9, 1627, 480, "climb"),
  "innsbruck-kom-after-party": route("innsbruck-kom-after-party", "Innsbruck KOM After Party", "Innsbruck", 23, 2156, 735, "climb"),

  "london-classique": route("london-classique", "London Classique", "London", 3.7, 82, 110, "flat"),
  "london-greater-london-flat": route("london-greater-london-flat", "Greater London Flat", "London", 7.3, 174, 230, "flat"),
  "london-calling": route("london-calling", "London Calling", "London", 19.4, 682, 620, "rolling"),

  "makuri-electric-loop": route("makuri-electric-loop", "Electric Loop", "Makuri Islands", 5.6, 141, 180, "flat"),
  "makuri-neon-flats": route("makuri-neon-flats", "Neon Flats", "Makuri Islands", 9.2, 236, 290, "flat"),
  "makuri-chasing-the-sun": route("makuri-chasing-the-sun", "Chasing the Sun", "Makuri Islands", 21.8, 1037, 700, "rolling"),

  "new-york-the-6-train": route("new-york-the-6-train", "The 6 Train", "New York", 4.4, 230, 130, "rolling"),
  "new-york-spinfinity": route("new-york-spinfinity", "Spinfinity", "New York", 12.1, 509, 390, "rolling"),
  "new-york-the-greenway": route("new-york-the-greenway", "The Greenway", "New York", 22.8, 968, 805, "rolling"),

  "paris-lutece-express": route("paris-lutece-express", "Lutece Express", "Paris", 6.1, 210, 140, "flat"),
  "paris-cirque-du-suffer": route("paris-cirque-du-suffer", "Cirque du Suffer", "Paris", 13, 95, 415, "flat"),
  "paris-montmartre-mixer": route("paris-montmartre-mixer", "Montmartre Mixer", "Paris", 15.6, 623, 505, "rolling"),

  "richmond-fan-flats": route("richmond-fan-flats", "Fan Flats", "Richmond", 4.7, 112, 150, "flat"),
  "richmond-uci-worlds": route("richmond-uci-worlds", "UCI Worlds", "Richmond", 10.3, 528, 330, "rolling"),
  "richmond-libby-hill-after-party": route("richmond-libby-hill-after-party", "Libby Hill After Party", "Richmond", 20.4, 525, 655, "rolling"),

  "scotland-loch-loop": route("scotland-loch-loop", "Loch Loop", "Scotland", 5, 233, 160, "rolling"),
  "scotland-rolling-highlands": route("scotland-rolling-highlands", "Rolling Highlands", "Scotland", 8.7, 344, 280, "rolling"),
  "scotland-the-muckle-yin": route("scotland-the-muckle-yin", "The Muckle Yin", "Scotland", 14.6, 925, 470, "climb"),

  "yorkshire-duchy-estate": route("yorkshire-duchy-estate", "Duchy Estate", "Yorkshire", 3, 230, 60, "rolling"),
  "yorkshire-harrogate-circuit": route("yorkshire-harrogate-circuit", "Harrogate Circuit", "Yorkshire", 8.6, 804, 270, "climb"),
  "yorkshire-double-loop": route("yorkshire-double-loop", "Yorkshire Double Loop", "Yorkshire", 18.4, 1795, 590, "climb"),
};

const watopiaRouteIdsByMode: Record<WorkoutMode, [string, string, string]> = {
  rest: ["volcano-circuit", "volcano-flat", "tempus-fugit"],
  recovery: ["volcano-circuit", "volcano-flat", "tempus-fugit"],
  endurance: ["beach-island-loop", "tick-tock", "big-flat-8"],
  tempo: ["hilly-route", "volcano-climb", "triple-flat-loops"],
};

const guestRouteIds: Record<Exclude<ZwiftWorld, "Watopia">, [string, string, string]> = {
  France: ["france-croissant", "france-douce-france", "france-three-musketeers"],
  Innsbruck: ["innsbruck-innsbruckring", "innsbruck-2018-worlds-short-lap", "innsbruck-kom-after-party"],
  London: ["london-classique", "london-greater-london-flat", "london-calling"],
  "Makuri Islands": ["makuri-electric-loop", "makuri-neon-flats", "makuri-chasing-the-sun"],
  "New York": ["new-york-the-6-train", "new-york-spinfinity", "new-york-the-greenway"],
  Paris: ["paris-lutece-express", "paris-cirque-du-suffer", "paris-montmartre-mixer"],
  Richmond: ["richmond-fan-flats", "richmond-uci-worlds", "richmond-libby-hill-after-party"],
  Scotland: ["scotland-loch-loop", "scotland-rolling-highlands", "scotland-the-muckle-yin"],
  Yorkshire: ["yorkshire-duchy-estate", "yorkshire-harrogate-circuit", "yorkshire-double-loop"],
};

const commitments: RouteCommitment[] = [30, 60, 90];

const intensity: Record<WorkoutMode, { low: number; high: number; heartRateCue: string }> = {
  rest: { low: 0.45, high: 0.55, heartRateCue: "Optional only · RPE 1–2" },
  recovery: { low: 0.5, high: 0.6, heartRateCue: "Easy breathing · RPE 2–3" },
  endurance: { low: 0.6, high: 0.72, heartRateCue: "Conversational · RPE 3–4" },
  tempo: { low: 0.76, high: 0.88, heartRateCue: "Controlled rise · RPE 6–7" },
};

const timingCues: Record<RouteCommitment, string> = {
  30: "Stop at 30 min; completing the route is optional.",
  60: "Use the route as structure and cool down at 60 min.",
  90: "Continue or add easy riding to reach the 90-min cap.",
};

const modeReason: Record<WorkoutMode, Record<ZwiftRoute["profile"], string>> = {
  rest: {
    flat: "Held in reserve only if the check-in improves and movement is pain-free.",
    rolling: "Shown for planning ahead; do not let the terrain override today's rest guardrail.",
    climb: "Shown for planning ahead; climbing is intentionally paused while the rest guardrail is active.",
  },
  recovery: {
    flat: "Flat terrain keeps the focus on smooth, quiet pedaling and makes it easy to stop on time.",
    rolling: "Gentle terrain variation without turning this into a workout; stay easy on every rise.",
    climb: "This world is in rotation, but keep gearing light and turn around before the climb drives intensity.",
  },
  endurance: {
    flat: "Steady terrain makes it easier to hold an even aerobic effort without unnecessary surges.",
    rolling: "Rolling terrain adds variety while still supporting a controlled endurance rhythm.",
    climb: "Use easy gearing on the climbs and protect the endurance ceiling instead of chasing speed.",
  },
  tempo: {
    flat: "The uninterrupted roads suit controlled tempo blocks with clean recoveries between them.",
    rolling: "The rollers provide natural structure for tempo work without requiring a single long climb.",
    climb: "The sustained climbing supports controlled tempo blocks; cap the effort before threshold.",
  },
};

function isZwiftWorld(value: string): value is ZwiftWorld {
  return (ZWIFT_WORLDS as readonly string[]).includes(value);
}

function worldsForSuite(activeWorlds: readonly string[]): [ZwiftWorld, ZwiftWorld, ZwiftWorld] {
  const normalized = Array.from(new Set(activeWorlds.filter(isZwiftWorld)));
  const guests = normalized.filter((world): world is Exclude<ZwiftWorld, "Watopia"> => world !== "Watopia");
  if (guests.length >= 2) return [guests[0], guests[1], "Watopia"];
  if (guests.length === 1) return [guests[0], "Watopia", "Watopia"];
  return ["Watopia", "Watopia", "Watopia"];
}

export function recommendZwiftRoutes(
  mode: WorkoutMode,
  ftpWatts: number,
  activeWorlds: readonly string[] = ["Watopia"],
): ZwiftRouteSuggestion[] {
  const safeFtp = Number.isFinite(ftpWatts) && ftpWatts > 0 ? ftpWatts : 165;
  const watts = intensity[mode];
  const recommendedCommitment: RouteCommitment = mode === "recovery" || mode === "rest" ? 30 : 60;
  const suggestionWorlds = worldsForSuite(activeWorlds);

  return suggestionWorlds.map((world, index) => {
    const routeId = world === "Watopia"
      ? watopiaRouteIdsByMode[mode][index]
      : guestRouteIds[world][index];
    const selectedRoute = routes[routeId];

    return {
      commitment: commitments[index],
      route: selectedRoute,
      targetWatts: `${Math.round(safeFtp * watts.low)}–${Math.round(safeFtp * watts.high)} W`,
      heartRateCue: watts.heartRateCue,
      reason: `${selectedRoute.world} is available in today's rotation. ${modeReason[mode][selectedRoute.profile]}`,
      timingCue: timingCues[commitments[index]],
      recommended: commitments[index] === recommendedCommitment,
      disabled: mode === "rest",
    };
  });
}
