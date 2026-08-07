import type { WorkoutMode } from "./phase3";

export type RouteCommitment = 30 | 60 | 90;

export type RouteTraceSegment = {
  x: number;
  y: number;
  width: number;
  angle: number;
};

export type ZwiftRoute = {
  id: string;
  name: string;
  world: "Watopia";
  distanceMiles: number;
  elevationFeet: number;
  badgeXp: number;
  profile: "flat" | "rolling" | "climb";
  trace: RouteTraceSegment[];
  elevation: number[];
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

const routes: Record<string, ZwiftRoute> = {
  "volcano-circuit": {
    id: "volcano-circuit",
    name: "Volcano Circuit",
    world: "Watopia",
    distanceMiles: 3.3,
    elevationFeet: 91,
    badgeXp: 80,
    profile: "flat",
    trace: [
      { x: 9, y: 57, width: 27, angle: -17 },
      { x: 31, y: 48, width: 23, angle: -48 },
      { x: 44, y: 28, width: 27, angle: 5 },
      { x: 67, y: 34, width: 22, angle: 53 },
      { x: 73, y: 54, width: 23, angle: 140 },
      { x: 53, y: 67, width: 27, angle: 176 },
      { x: 27, y: 67, width: 21, angle: -151 },
    ],
    elevation: [18, 26, 34, 42, 54, 45, 30, 24, 20, 27, 34, 22],
  },
  "volcano-flat": {
    id: "volcano-flat",
    name: "Volcano Flat",
    world: "Watopia",
    distanceMiles: 7.8,
    elevationFeet: 167,
    badgeXp: 240,
    profile: "flat",
    trace: [
      { x: 8, y: 67, width: 28, angle: -18 },
      { x: 32, y: 58, width: 24, angle: -45 },
      { x: 47, y: 38, width: 33, angle: -6 },
      { x: 75, y: 35, width: 18, angle: 54 },
      { x: 78, y: 53, width: 27, angle: 139 },
      { x: 55, y: 68, width: 25, angle: 171 },
      { x: 32, y: 68, width: 20, angle: -158 },
    ],
    elevation: [16, 20, 24, 30, 38, 44, 37, 29, 33, 27, 22, 18],
  },
  "tempus-fugit": {
    id: "tempus-fugit",
    name: "Tempus Fugit",
    world: "Watopia",
    distanceMiles: 12.2,
    elevationFeet: 105,
    badgeXp: 380,
    profile: "flat",
    trace: [
      { x: 8, y: 58, width: 26, angle: -7 },
      { x: 31, y: 53, width: 30, angle: -20 },
      { x: 57, y: 43, width: 28, angle: 8 },
      { x: 80, y: 50, width: 16, angle: 76 },
      { x: 77, y: 66, width: 28, angle: 172 },
      { x: 50, y: 68, width: 27, angle: -175 },
      { x: 25, y: 66, width: 19, angle: 163 },
    ],
    elevation: [20, 24, 22, 27, 25, 31, 28, 34, 27, 24, 29, 21],
  },
  "beach-island-loop": {
    id: "beach-island-loop",
    name: "Beach Island Loop",
    world: "Watopia",
    distanceMiles: 8,
    elevationFeet: 160,
    badgeXp: 255,
    profile: "flat",
    trace: [
      { x: 8, y: 61, width: 24, angle: -19 },
      { x: 29, y: 51, width: 20, angle: -58 },
      { x: 39, y: 32, width: 34, angle: -3 },
      { x: 69, y: 35, width: 20, angle: 47 },
      { x: 74, y: 53, width: 25, angle: 139 },
      { x: 52, y: 67, width: 28, angle: 176 },
      { x: 26, y: 67, width: 20, angle: -160 },
    ],
    elevation: [18, 24, 29, 42, 52, 44, 31, 24, 35, 31, 25, 20],
  },
  "tick-tock": {
    id: "tick-tock",
    name: "Tick Tock",
    world: "Watopia",
    distanceMiles: 12,
    elevationFeet: 194,
    badgeXp: 380,
    profile: "flat",
    trace: [
      { x: 8, y: 63, width: 28, angle: -18 },
      { x: 33, y: 53, width: 24, angle: -39 },
      { x: 49, y: 37, width: 32, angle: 1 },
      { x: 78, y: 40, width: 17, angle: 62 },
      { x: 78, y: 57, width: 29, angle: 150 },
      { x: 52, y: 69, width: 27, angle: 177 },
      { x: 27, y: 69, width: 20, angle: -161 },
    ],
    elevation: [16, 20, 27, 35, 46, 39, 33, 30, 42, 35, 26, 19],
  },
  "big-flat-8": {
    id: "big-flat-8",
    name: "Big Flat 8",
    world: "Watopia",
    distanceMiles: 18.1,
    elevationFeet: 338,
    badgeXp: 580,
    profile: "rolling",
    trace: [
      { x: 7, y: 64, width: 25, angle: -22 },
      { x: 29, y: 51, width: 20, angle: -61 },
      { x: 38, y: 31, width: 28, angle: -12 },
      { x: 62, y: 25, width: 25, angle: 22 },
      { x: 80, y: 36, width: 18, angle: 75 },
      { x: 78, y: 55, width: 25, angle: 139 },
      { x: 57, y: 68, width: 29, angle: 176 },
      { x: 30, y: 68, width: 22, angle: -166 },
    ],
    elevation: [17, 24, 31, 45, 63, 47, 38, 54, 44, 32, 25, 19],
  },
  "hilly-route": {
    id: "hilly-route",
    name: "Hilly Route",
    world: "Watopia",
    distanceMiles: 5.8,
    elevationFeet: 359,
    badgeXp: 180,
    profile: "rolling",
    trace: [
      { x: 8, y: 66, width: 22, angle: -28 },
      { x: 27, y: 53, width: 20, angle: -69 },
      { x: 34, y: 33, width: 28, angle: -17 },
      { x: 59, y: 25, width: 24, angle: 31 },
      { x: 76, y: 39, width: 20, angle: 92 },
      { x: 70, y: 60, width: 25, angle: 157 },
      { x: 47, y: 68, width: 24, angle: 177 },
      { x: 25, y: 68, width: 19, angle: -173 },
    ],
    elevation: [12, 18, 28, 54, 85, 65, 39, 73, 50, 33, 22, 16],
  },
  "volcano-climb": {
    id: "volcano-climb",
    name: "Volcano Climb",
    world: "Watopia",
    distanceMiles: 14.3,
    elevationFeet: 669,
    badgeXp: 460,
    profile: "climb",
    trace: [
      { x: 8, y: 68, width: 25, angle: -14 },
      { x: 30, y: 59, width: 20, angle: -51 },
      { x: 41, y: 41, width: 22, angle: -23 },
      { x: 60, y: 32, width: 19, angle: 44 },
      { x: 70, y: 47, width: 16, angle: 133 },
      { x: 57, y: 59, width: 14, angle: -143 },
      { x: 45, y: 51, width: 12, angle: -45 },
      { x: 51, y: 40, width: 10, angle: 51 },
    ],
    elevation: [10, 16, 23, 31, 43, 58, 75, 92, 80, 62, 36, 18],
  },
  "triple-flat-loops": {
    id: "triple-flat-loops",
    name: "Triple Flat Loops",
    world: "Watopia",
    distanceMiles: 21.1,
    elevationFeet: 514,
    badgeXp: 680,
    profile: "rolling",
    trace: [
      { x: 7, y: 65, width: 24, angle: -25 },
      { x: 28, y: 52, width: 18, angle: -66 },
      { x: 35, y: 34, width: 28, angle: -18 },
      { x: 60, y: 25, width: 22, angle: 30 },
      { x: 76, y: 38, width: 18, angle: 88 },
      { x: 72, y: 57, width: 22, angle: 151 },
      { x: 52, y: 67, width: 20, angle: 179 },
      { x: 33, y: 66, width: 14, angle: -154 },
      { x: 24, y: 57, width: 20, angle: -18 },
    ],
    elevation: [14, 21, 31, 48, 67, 44, 35, 59, 47, 33, 24, 16],
  },
};

const routeIdsByMode: Record<WorkoutMode, [string, string, string]> = {
  rest: ["volcano-circuit", "volcano-flat", "tempus-fugit"],
  recovery: ["volcano-circuit", "volcano-flat", "tempus-fugit"],
  endurance: ["beach-island-loop", "tick-tock", "big-flat-8"],
  tempo: ["hilly-route", "volcano-climb", "triple-flat-loops"],
};

const commitments: RouteCommitment[] = [30, 60, 90];

const intensity: Record<WorkoutMode, { low: number; high: number; heartRateCue: string }> = {
  rest: { low: 0.45, high: 0.55, heartRateCue: "Optional only · RPE 1–2" },
  recovery: { low: 0.5, high: 0.6, heartRateCue: "Easy breathing · RPE 2–3" },
  endurance: { low: 0.6, high: 0.72, heartRateCue: "Conversational · RPE 3–4" },
  tempo: { low: 0.76, high: 0.88, heartRateCue: "Controlled rise · RPE 6–7" },
};

const reasons: Record<WorkoutMode, [string, string, string]> = {
  rest: [
    "Held in reserve only if the check-in improves and movement is pain-free.",
    "A flat fallback, not a replacement for the rest recommendation.",
    "Shown for planning ahead; keep today off the bike while the rest guardrail is active.",
  ],
  recovery: [
    "Short, flat, and easy to stop on time without chasing extra work.",
    "A low-climbing route that keeps the focus on smooth, quiet pedaling.",
    "Longer flat terrain for an easy day when the shorter option feels too brief.",
  ],
  endurance: [
    "Enough route variety for a compact aerobic session without unnecessary climbing.",
    "Steady terrain makes it easier to hold an even endurance effort for an hour.",
    "A longer loop with modest climbing for durability without turning into a threshold day.",
  ],
  tempo: [
    "Short rollers give the 30-minute option enough structure without a long commitment.",
    "The sustained climb naturally supports controlled tempo blocks and easy recoveries.",
    "Rolling terrain suits a longer tempo day while leaving room to settle between efforts.",
  ],
};

const timingCues: Record<RouteCommitment, string> = {
  30: "Stop at 30 min; completing the route is optional.",
  60: "Use the route as structure and cool down at 60 min.",
  90: "Continue or add easy riding to reach the 90-min cap.",
};

export function recommendZwiftRoutes(mode: WorkoutMode, ftpWatts: number): ZwiftRouteSuggestion[] {
  const safeFtp = Number.isFinite(ftpWatts) && ftpWatts > 0 ? ftpWatts : 165;
  const watts = intensity[mode];
  const recommendedCommitment: RouteCommitment = mode === "recovery" || mode === "rest" ? 30 : 60;

  return routeIdsByMode[mode].map((routeId, index) => ({
    commitment: commitments[index],
    route: routes[routeId],
    targetWatts: `${Math.round(safeFtp * watts.low)}–${Math.round(safeFtp * watts.high)} W`,
    heartRateCue: watts.heartRateCue,
    reason: reasons[mode][index],
    timingCue: timingCues[commitments[index]],
    recommended: commitments[index] === recommendedCommitment,
    disabled: mode === "rest",
  }));
}
