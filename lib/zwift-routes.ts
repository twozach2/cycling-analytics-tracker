import type { CoachConfidence } from "./coach";
import {
  buildRideIntention,
  RIDE_DURATION_WINDOWS,
  RIDE_INTENSITY_BANDS,
  type RideIntention,
  type RouteCommitment,
} from "./ride-intentions";
import type { WorkoutMode } from "./phase3";

export type { RouteCommitment } from "./ride-intentions";

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

export type RouteTimeWindow = {
  minimumMinutes: number;
  maximumMinutes: number;
};

export type ZwiftRouteSuggestion = {
  commitment: RouteCommitment;
  route: ZwiftRoute;
  intention: RideIntention;
  estimatedMinutes: number;
  estimatedMinimumMinutes: number;
  estimatedMaximumMinutes: number;
  timeWindow: RouteTimeWindow;
  targetWatts: string;
  focus: string;
  rideCue: string;
  terrainCue: string;
  optionalStretch: string;
  encouragement: string;
  heartRateCue: string;
  reason: string;
  timingCue: string;
  recommended: boolean;
  disabled: boolean;
};

export type ZwiftRouteEstimate = {
  minimumMinutes: number;
  maximumMinutes: number;
  midpointMinutes: number;
  minimumPowerWatts: number;
  maximumPowerWatts: number;
};


export const ROUTE_TIME_WINDOWS: Record<RouteCommitment, RouteTimeWindow> = {
  ...RIDE_DURATION_WINDOWS,
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
  "watopia-flat-route": route("watopia-flat-route", "Flat Route", "Watopia", 6.7, 200, 200, "flat"),
  "sand-and-sequoias": route("sand-and-sequoias", "Sand and Sequoias", "Watopia", 14, 594, 400, "rolling"),
  "watopia-figure-8": route("watopia-figure-8", "Figure 8", "Watopia", 18.7, 837, 580, "rolling"),
  "watopia-figure-8-reverse": route("watopia-figure-8-reverse", "Figure 8 Reverse", "Watopia", 18.5, 833, 580, "rolling"),
  "watopia-mountain-route": route("watopia-mountain-route", "Mountain Route", "Watopia", 18.8, 2244, 580, "climb"),
  "road-to-sky": route("road-to-sky", "Road to Sky", "Watopia", 11.1, 3448, 380, "climb"),

  "france-croissant": route("france-croissant", "Croissant", "France", 7.7, 230, 185, "flat"),
  "france-douce-france": route("france-douce-france", "Douce France", "France", 15.4, 446, 465, "rolling"),
  "france-three-musketeers": route("france-three-musketeers", "Three Musketeers", "France", 22.2, 656, 705, "rolling"),
  "france-petite-douleur": route("france-petite-douleur", "Petite Douleur", "France", 8.6, 1266, 280, "climb"),
  "france-casse-pattes": route("france-casse-pattes", "Casse-Pattes", "France", 14.8, 509, 460, "rolling"),
  "france-rgv": route("france-rgv", "R.G.V.", "France", 15.5, 436, 480, "flat"),
  "france-roule-ma-poule": route("france-roule-ma-poule", "Roule Ma Poule", "France", 16.1, 863, 460, "rolling"),
  "france-la-reine": route("france-la-reine", "La Reine", "France", 14, 3940, 460, "climb"),

  "innsbruck-innsbruckring": route("innsbruck-innsbruckring", "Innsbruckring", "Innsbruck", 5.7, 256, 170, "rolling"),
  "innsbruck-2018-worlds-short-lap": route("innsbruck-2018-worlds-short-lap", "2018 Worlds Short Lap", "Innsbruck", 14.9, 1627, 480, "climb"),
  "innsbruck-kom-after-party": route("innsbruck-kom-after-party", "Innsbruck KOM After Party", "Innsbruck", 23, 2156, 735, "climb"),
  "innsbruck-lutscher": route("innsbruck-lutscher", "Lutscher", "Innsbruck", 15.3, 2720, 270, "climb"),
  "innsbruck-lutscher-ccw": route("innsbruck-lutscher-ccw", "Lutscher CCW", "Innsbruck", 14.1, 2713, 270, "climb"),

  "london-classique": route("london-classique", "London Classique", "London", 3.7, 82, 110, "flat"),
  "london-greater-london-flat": route("london-greater-london-flat", "Greater London Flat", "London", 7.3, 174, 230, "flat"),
  "london-calling": route("london-calling", "London Calling", "London", 19.4, 682, 620, "rolling"),
  "london-flat": route("london-flat", "London Flat", "London", 7.5, 381, 240, "rolling"),
  "london-loop": route("london-loop", "London Loop", "London", 9.5, 771, 300, "climb"),
  "london-8": route("london-8", "London 8", "London", 12.7, 846, 410, "rolling"),
  "london-greater-london-loop": route("london-greater-london-loop", "Greater London Loop", "London", 13.4, 850, 420, "rolling"),
  "london-greatest-london-flat": route("london-greatest-london-flat", "Greatest London Flat", "London", 15, 554, 500, "rolling"),

  "makuri-electric-loop": route("makuri-electric-loop", "Electric Loop", "Makuri Islands", 5.6, 141, 180, "flat"),
  "makuri-neon-flats": route("makuri-neon-flats", "Neon Flats", "Makuri Islands", 9.2, 236, 290, "flat"),
  "makuri-chasing-the-sun": route("makuri-chasing-the-sun", "Chasing the Sun", "Makuri Islands", 21.8, 1037, 700, "rolling"),
  "makuri-sleepless-city": route("makuri-sleepless-city", "Sleepless City", "Makuri Islands", 5.9, 141, 190, "flat"),
  "makuri-two-village-loop": route("makuri-two-village-loop", "Two Village Loop", "Makuri Islands", 8, 289, 255, "flat"),
  "makuri-red-zone-repeats": route("makuri-red-zone-repeats", "Red Zone Repeats", "Makuri Islands", 12.1, 285, 390, "flat"),
  "makuri-neokyo-all-nighter": route("makuri-neokyo-all-nighter", "Neokyo All-Nighter", "Makuri Islands", 15.1, 551, 490, "rolling"),
  "makuri-neon-shore-loop": route("makuri-neon-shore-loop", "Neon Shore Loop", "Makuri Islands", 20.5, 846, 660, "rolling"),
  "makuri-country-to-coastal": route("makuri-country-to-coastal", "Country to Coastal", "Makuri Islands", 20.8, 919, 665, "rolling"),

  "new-york-the-6-train": route("new-york-the-6-train", "The 6 Train", "New York", 4.4, 230, 130, "rolling"),
  "new-york-spinfinity": route("new-york-spinfinity", "Spinfinity", "New York", 12.1, 509, 390, "rolling"),
  "new-york-the-greenway": route("new-york-the-greenway", "The Greenway", "New York", 22.8, 968, 805, "rolling"),
  "new-york-gotham-grind": route("new-york-gotham-grind", "Gotham Grind", "New York", 5.8, 315, 190, "rolling"),
  "new-york-astoria-line-8": route("new-york-astoria-line-8", "Astoria Line 8", "New York", 7.6, 509, 230, "rolling"),
  "new-york-empire-elevation": route("new-york-empire-elevation", "Empire Elevation", "New York", 15, 873, 485, "rolling"),
  "new-york-stay-puft-pursuit": route("new-york-stay-puft-pursuit", "Stay Puft Pursuit", "New York", 19.5, 1365, 625, "rolling"),
  "new-york-spinfinity-ultra": route("new-york-spinfinity-ultra", "Spinfinity Ultra", "New York", 22.1, 955, 710, "rolling"),

  "paris-lutece-express": route("paris-lutece-express", "Lutece Express", "Paris", 6.1, 210, 140, "flat"),
  "paris-cirque-du-suffer": route("paris-cirque-du-suffer", "Cirque du Suffer", "Paris", 13, 95, 415, "flat"),
  "paris-montmartre-mixer": route("paris-montmartre-mixer", "Montmartre Mixer", "Paris", 15.6, 623, 505, "rolling"),
  "paris-champs-elysees": route("paris-champs-elysees", "Champs-Élysées", "Paris", 6.1, 171, 140, "flat"),

  "richmond-fan-flats": route("richmond-fan-flats", "Fan Flats", "Richmond", 4.7, 112, 150, "flat"),
  "richmond-uci-worlds": route("richmond-uci-worlds", "UCI Worlds", "Richmond", 10.3, 528, 330, "rolling"),
  "richmond-libby-hill-after-party": route("richmond-libby-hill-after-party", "Libby Hill After Party", "Richmond", 20.4, 525, 655, "rolling"),
  "richmond-cobbled-climbs": route("richmond-cobbled-climbs", "Cobbled Climbs", "Richmond", 5.9, 449, 180, "climb"),
  "richmond-cobbled-crown": route("richmond-cobbled-crown", "Cobbled Crown", "Richmond", 14.9, 945, 480, "rolling"),

  "scotland-loch-loop": route("scotland-loch-loop", "Loch Loop", "Scotland", 5, 233, 160, "rolling"),
  "scotland-rolling-highlands": route("scotland-rolling-highlands", "Rolling Highlands", "Scotland", 8.7, 344, 280, "rolling"),
  "scotland-the-muckle-yin": route("scotland-the-muckle-yin", "The Muckle Yin", "Scotland", 14.6, 925, 470, "climb"),
  "scotland-the-epiloch": route("scotland-the-epiloch", "The Epiloch", "Scotland", 5, 308, 160, "rolling"),
  "scotland-city-and-the-sgurr": route("scotland-city-and-the-sgurr", "City and the Sgurr", "Scotland", 5.2, 545, 120, "climb"),
  "scotland-braek-fast": route("scotland-braek-fast", "BRAEk-fast Crits and Grits", "Scotland", 13.7, 856, 415, "rolling"),

  "yorkshire-duchy-estate": route("yorkshire-duchy-estate", "Duchy Estate", "Yorkshire", 3, 230, 60, "rolling"),
  "yorkshire-harrogate-circuit": route("yorkshire-harrogate-circuit", "Harrogate Circuit", "Yorkshire", 8.6, 804, 270, "climb"),
  "yorkshire-double-loop": route("yorkshire-double-loop", "Yorkshire Double Loop", "Yorkshire", 18.4, 1795, 590, "climb"),
  "yorkshire-queens-highway": route("yorkshire-queens-highway", "Queen's Highway", "Yorkshire", 3.4, 272, 60, "rolling"),
  "yorkshire-tour-of-tewit-well": route("yorkshire-tour-of-tewit-well", "Tour of Tewit Well", "Yorkshire", 6.9, 673, 210, "climb"),
  "yorkshire-queens-highway-after-party": route("yorkshire-queens-highway-after-party", "Queen's Highway After Party", "Yorkshire", 12.3, 988, 340, "climb"),
  "yorkshire-royal-pump-room-8": route("yorkshire-royal-pump-room-8", "Royal Pump Room 8", "Yorkshire", 17.4, 1611, 550, "climb"),
};

const routeList = Object.values(routes);
export const ZWIFT_ROUTE_CATALOG: readonly ZwiftRoute[] = routeList;
export const ZWIFT_ROUTE_COUNT = routeList.length;

const commitments: RouteCommitment[] = [30, 60, 90];

export const ROUTE_INTENSITY_BANDS = RIDE_INTENSITY_BANDS;

const modeReason: Record<WorkoutMode, Record<ZwiftRoute["profile"], string>> = {
  rest: {
    flat: "Save this flat route for a day when easy movement sounds inviting.",
    rolling: "Keep this scenic option in your pocket for another day; there is nothing to make up.",
    climb: "This climbing route will still be here when your body is ready to enjoy it.",
  },
  recovery: {
    flat: "Flat terrain makes it easy to spin comfortably, look around, and stop whenever you have had enough.",
    rolling: "Let the gentle rises change your cadence naturally; easing off is always part of the ride.",
    climb: "Use light gearing and enjoy as much of the climb as feels good—turning around early still counts.",
  },
  endurance: {
    flat: "Steady roads invite a comfortable aerobic rhythm, but small pace changes are completely fine.",
    rolling: "The rollers add variety: ride the rises by feel and return to an easy rhythm on the other side.",
    climb: "Settle into an easy climbing gear and let the route—not a strict power number—shape the day.",
  },
  tempo: {
    flat: "Long uninterrupted roads give you room for a few comfortably strong stretches whenever you feel ready.",
    rolling: "Use selected rollers for tempo and enjoy easy riding between them; every hill does not need an effort.",
    climb: "The longer climbs offer natural tempo opportunities, with full permission to ease off at any point.",
  },
};


const terrainCue: Record<ZwiftRoute["profile"], string> = {
  flat: "Flat cue: find a relaxed cadence and let speed be whatever it is today.",
  rolling: "Rolling cue: allow power to rise gently uphill and settle again over the crest.",
  climb: "Climbing cue: choose a light gear, ride by feel, and shorten the climb if that keeps the day enjoyable.",
};

function optionalStretch(mode: WorkoutMode, profile: ZwiftRoute["profile"]) {
  if (mode === "rest") return "Optional: take a walk, stretch, or do nothing at all.";
  if (mode === "recovery") return "If you finish feeling better than you started, add five relaxed minutes—or stop while it still feels good.";
  if (mode === "endurance") return profile === "climb"
    ? "If you feel smooth near the end, let one final climb drift into low tempo, then ease home."
    : "If you feel smooth near the end, add 5–10 minutes of low tempo, then cool down.";
  return "If you still feel smooth, add one more short tempo stretch. Skipping it is equally valid.";
}

const profilePenalty: Record<WorkoutMode, Record<ZwiftRoute["profile"], number>> = {
  rest: { flat: 0, rolling: 0.2, climb: 0.7 },
  recovery: { flat: 0, rolling: 0.2, climb: 0.65 },
  endurance: { flat: 0.1, rolling: 0, climb: 0.2 },
  tempo: { flat: 0.28, rolling: 0, climb: 0.08 },
};

function isZwiftWorld(value: string): value is ZwiftWorld {
  return (ZWIFT_WORLDS as readonly string[]).includes(value);
}

function speedForRoute(
  powerWatts: number,
  systemWeightKg: number,
  distanceMeters: number,
  elevationMeters: number,
): number {
  const gravity = 9.80665;
  const rollingResistance = 0.004;
  const airDensity = 1.225;
  const dragArea = 0.42;
  const drivetrainEfficiency = 0.97;
  const effectiveGrade = elevationMeters / distanceMeters;
  const wheelPower = powerWatts * drivetrainEfficiency;
  const resistanceForce = systemWeightKg * gravity * (rollingResistance + effectiveGrade);
  const aerodynamicFactor = 0.5 * airDensity * dragArea;
  let lowSpeed = 0.25;
  let highSpeed = 20;

  for (let iteration = 0; iteration < 60; iteration += 1) {
    const speed = (lowSpeed + highSpeed) / 2;
    const requiredPower = (resistanceForce * speed) + (aerodynamicFactor * speed ** 3);
    if (requiredPower > wheelPower) highSpeed = speed;
    else lowSpeed = speed;
  }

  return (lowSpeed + highSpeed) / 2;
}

export function estimateZwiftRouteTime(
  routeValue: ZwiftRoute,
  ftpWatts: number,
  bodyWeightKg: number,
  mode: WorkoutMode = "endurance",
): ZwiftRouteEstimate {
  if (!Number.isFinite(ftpWatts) || ftpWatts <= 0) throw new Error("A saved FTP is required for route estimates.");
  if (!Number.isFinite(bodyWeightKg) || bodyWeightKg <= 0) throw new Error("A saved body weight is required for route estimates.");
  const effort = ROUTE_INTENSITY_BANDS[mode];
  const maximumPowerWatts = ftpWatts * effort.high;
  const minimumPowerWatts = ftpWatts * effort.low;
  const distanceMeters = Math.max(1, routeValue.distanceMiles * 1609.344);
  const elevationMeters = Math.max(0, routeValue.elevationFeet * 0.3048);
  const systemWeightKg = bodyWeightKg + 10;
  const slowSpeed = speedForRoute(minimumPowerWatts, systemWeightKg, distanceMeters, elevationMeters);
  const fastSpeed = speedForRoute(maximumPowerWatts, systemWeightKg, distanceMeters, elevationMeters);
  const maximumMinutes = Math.ceil((distanceMeters / slowSpeed) / 60);
  const minimumMinutes = Math.ceil((distanceMeters / fastSpeed) / 60);

  return {
    minimumMinutes,
    maximumMinutes,
    midpointMinutes: Math.round((minimumMinutes + maximumMinutes) / 2),
    minimumPowerWatts: Math.round(minimumPowerWatts),
    maximumPowerWatts: Math.round(maximumPowerWatts),
  };
}

export function estimateZwiftRouteMinutes(
  routeValue: ZwiftRoute,
  ftpWatts: number,
  bodyWeightKg: number,
  mode: WorkoutMode = "endurance",
): number {
  return estimateZwiftRouteTime(routeValue, ftpWatts, bodyWeightKg, mode).midpointMinutes;
}

function seededUnit(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function rankRoute(
  routeValue: ZwiftRoute,
  mode: WorkoutMode,
  commitment: RouteCommitment,
  shuffleIndex: number,
  recentWorldCounts: ReadonlyMap<ZwiftWorld, number>,
  ftpWatts: number,
  bodyWeightKg: number,
): number {
  const window = ROUTE_TIME_WINDOWS[commitment];
  const estimate = estimateZwiftRouteMinutes(routeValue, ftpWatts, bodyWeightKg, mode);
  const center = (window.minimumMinutes + window.maximumMinutes) / 2;
  const distancePenalty = Math.abs(estimate - center) / (window.maximumMinutes - window.minimumMinutes);
  const recentWorldPenalty = Math.min(3, recentWorldCounts.get(routeValue.world) ?? 0) * 0.24;
  return seededUnit(`${shuffleIndex}:${commitment}:${routeValue.id}`)
    + profilePenalty[mode][routeValue.profile]
    + (distancePenalty * 0.12)
    + recentWorldPenalty;
}

export function recommendZwiftRoutes(
  mode: WorkoutMode,
  ftpWatts: number,
  bodyWeightKg: number,
  worldPool: readonly string[] = ZWIFT_WORLDS,
  shuffleIndex = 0,
  recentRouteIds: readonly string[] = [],
  lthrBpm: number | null = null,
  confidence: CoachConfidence = "low",
  evidenceRationale?: string,
): ZwiftRouteSuggestion[] {
  if (!Number.isFinite(ftpWatts) || ftpWatts <= 0) throw new Error("A saved FTP is required for route recommendations.");
  if (!Number.isFinite(bodyWeightKg) || bodyWeightKg <= 0) throw new Error("A saved body weight is required for route recommendations.");
  const recommendedCommitment: RouteCommitment = mode === "recovery" || mode === "rest" ? 30 : 60;
  const allowedWorlds = new Set(worldPool.filter(isZwiftWorld));
  if (!allowedWorlds.size) ZWIFT_WORLDS.forEach((world) => allowedWorlds.add(world));
  const recent = new Set(recentRouteIds);
  const recentWorldCounts = new Map<ZwiftWorld, number>();
  recentRouteIds.forEach((routeId) => {
    const recentRoute = routes[routeId];
    if (recentRoute) recentWorldCounts.set(recentRoute.world, (recentWorldCounts.get(recentRoute.world) ?? 0) + 1);
  });
  const selectedRouteIds = new Set<string>();
  const selectedWorlds = new Set<ZwiftWorld>();

  return commitments.map((commitment) => {
    const window = ROUTE_TIME_WINDOWS[commitment];
    const inWindow = routeList.filter((routeValue) => {
      const estimate = estimateZwiftRouteMinutes(routeValue, ftpWatts, bodyWeightKg, mode);
      return allowedWorlds.has(routeValue.world)
        && estimate >= window.minimumMinutes
        && estimate <= window.maximumMinutes;
    });
    const routePools = [
      inWindow.filter((routeValue) => !recent.has(routeValue.id) && !selectedWorlds.has(routeValue.world)),
      inWindow.filter((routeValue) => !recent.has(routeValue.id)),
      inWindow.filter((routeValue) => !selectedWorlds.has(routeValue.world)),
      inWindow,
      routeList.filter((routeValue) => allowedWorlds.has(routeValue.world)),
    ];
    const candidatePool = routePools.find((pool) => pool.some((routeValue) => !selectedRouteIds.has(routeValue.id))) ?? routeList;
    const selectedRoute = [...candidatePool]
      .filter((routeValue) => !selectedRouteIds.has(routeValue.id))
      .sort((a, b) => (
        rankRoute(a, mode, commitment, shuffleIndex, recentWorldCounts, ftpWatts, bodyWeightKg)
          - rankRoute(b, mode, commitment, shuffleIndex, recentWorldCounts, ftpWatts, bodyWeightKg)
      ))[0];
    const routeEstimate = estimateZwiftRouteTime(selectedRoute, ftpWatts, bodyWeightKg, mode);
    const estimatedMinutes = routeEstimate.midpointMinutes;
    const intention = buildRideIntention({
      mode,
      commitment,
      ftpWatts,
      lthrBpm,
      confidence,
      evidenceRationale,
    });
    selectedRouteIds.add(selectedRoute.id);
    selectedWorlds.add(selectedRoute.world);

    return {
      commitment,
      route: selectedRoute,
      estimatedMinutes,
      intention,
      estimatedMinimumMinutes: routeEstimate.minimumMinutes,
      estimatedMaximumMinutes: routeEstimate.maximumMinutes,
      timeWindow: window,
      targetWatts: `${intention.power.lowWatts}–${intention.power.highWatts} W`,
      focus: intention.title,
      rideCue: intention.primaryCue,
      terrainCue: terrainCue[selectedRoute.profile],
      optionalStretch: optionalStretch(mode, selectedRoute.profile),
      encouragement: `${intention.encouragement} ${intention.flexibility}`,
      heartRateCue: intention.heartRateCue,
      reason: `${selectedRoute.world} brings a change of scenery. ${modeReason[mode][selectedRoute.profile]}`,
      timingCue: `Estimated ${routeEstimate.minimumMinutes}–${routeEstimate.maximumMinutes} min near ${routeEstimate.minimumPowerWatts}–${routeEstimate.maximumPowerWatts} W for today's ${intention.title.toLowerCase()} idea · matched to the ${window.minimumMinutes}–${window.maximumMinutes} min route window.`,
      recommended: commitment === recommendedCommitment,
      disabled: intention.disabled,
    };
  });
}
