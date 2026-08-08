export type MarkdownRide = {
  id: string;
  name: string;
  route: string;
  date: string;
  type: string;
  source: string;
  indoor: boolean;
  environment?: "virtual" | "indoor" | "outdoor";
  workoutSubtype?: "trainer_workout" | "race" | null;
  distanceMiles: number;
  movingTimeSeconds: number;
  elevationFeet: number;
  averagePower: number;
  maximumPower: number;
  normalizedPower: number | null;
  averageHeartRate: number;
  maximumHeartRate: number;
  averageCadence: number;
  maximumCadence: number;
  trainingLoad: number;
  intensityFactor: number;
  ftpAtRideWatts?: number | null;
  ftpSnapshotSource?: string | null;
  powerHeartRateRatio: number;
  decoupling: number | null;
  decouplingEligible?: boolean;
  decouplingEligibilityReason?: string;
  stoppedPercent?: number | null;
  variabilityIndex: number | null;
  cadenceStddev?: number | null;
  cadenceTargetPercent?: number | null;
  cadenceAcceptablePercent?: number | null;
  cadenceLowPercent?: number | null;
  cadenceHighPercent?: number | null;
  first15HeartRate?: number | null;
  final15HeartRate?: number | null;
  note: string;
};

export type MethodDefinition = {
  id: string;
  title: string;
  formula: string;
  note: string;
};

export const METHOD_DEFINITIONS: readonly MethodDefinition[] = [
  { id: "01", title: "Power / HR ratio", formula: "average power ÷ average heart rate", note: "Contextual efficiency signal for comparable steady rides." },
  { id: "02", title: "Intensity factor", formula: "normalized power ÷ FTP at ride date", note: "Every ride keeps its own FTP snapshot; changing today's FTP does not rewrite historical IF or load." },
  { id: "03", title: "Training load", formula: "hours × intensity² × 100", note: "A transparent TSS-like load, not a licensed physiological diagnosis." },
  { id: "04", title: "Aerobic decoupling", formula: "median central-interval efficiency · first half vs second half", note: "Ten equal-duration intervals are formed, with warm-up and cooldown edge buckets excluded. Interpretation requires ≥45 minutes, VI ≤1.08, ≤5% stopped time, a non-workout effort, sufficient paired power/HR samples, and no outsized warm-up signal." },
  { id: "05", title: "Load ratio", formula: "7-day load ÷ 28-day weekly average", note: "A review signal for abrupt changes, never an exact injury threshold." },
  { id: "06", title: "Readiness", formula: "recovery time + load + check-in", note: "A weighted, explainable score. Pain caps the result and overrides hard-ride advice." },
  { id: "07", title: "FTP prediction", formula: "20–60 min best power × duration factor", note: "A conservative range from recorded efforts, with confidence tied to available evidence." },
  { id: "08", title: "Goal scenarios", formula: "watts remaining ÷ monthly scenario", note: "Multiple clearly labeled estimates; never a promised achievement date." },
  { id: "09", title: "Zwift route time", formula: "rider power vs gravity + rolling resistance + aerodynamic drag", note: "A planning range from rider weight, sustainable W/kg, route distance, and total climbing; drafting and exact gradient profiles can change the result." },
];

type MarkdownExportConfig = {
  ftpWatts: number;
  bodyWeightKg: number;
  dataMode: "loading" | "demo" | "saved" | "unavailable";
};

const clean = (value: string) => value.replace(/\r?\n/g, " ").replace(/\s+/g, " ").trim() || "Not available";
const finite = (value: number | null | undefined, digits = 0, zeroIsMissing = true) => (
  value === null || value === undefined || !Number.isFinite(value) || (zeroIsMissing && value === 0)
    ? "Not available"
    : value.toFixed(digits)
);
const duration = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds <= 0) return "Not available";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = Math.round(seconds % 60);
  return hours > 0
    ? `${hours}h ${minutes}m ${remainingSeconds}s`
    : `${minutes}m ${remainingSeconds}s`;
};

export function buildCyclingMarkdown(
  rides: readonly MarkdownRide[],
  config: MarkdownExportConfig,
  generatedAt = new Date(),
): string {
  const sortedRides = [...rides].sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
  const bodyWeightPounds = config.bodyWeightKg * 2.2046226218;
  const totalSeconds = sortedRides.reduce((sum, ride) => sum + Math.max(0, ride.movingTimeSeconds), 0);
  const sourceLabel = config.dataMode === "saved" ? "Saved rider data" : "Fictional demo data";
  const lines = [
    "# Cycling Analytics Export",
    "",
    `Generated: ${generatedAt.toISOString()}`,
    `Data status: ${sourceLabel}`,
    "",
    "## Rider configuration",
    "",
    `- FTP: ${Math.round(config.ftpWatts)} W`,
    `- Body weight: ${bodyWeightPounds.toFixed(0)} lb (${config.bodyWeightKg.toFixed(1)} kg)`,
    `- FTP power-to-weight: ${(config.ftpWatts / config.bodyWeightKg).toFixed(2)} W/kg`,
    `- Zone 2 reference: ${Math.round(config.ftpWatts * 2 / 3)} W`,
    "- Preferred cadence band: 85–90 rpm",
    "- Zwift route-time assumption: approximately 1.0–1.2 W/kg average, capped below FTP",
    "",
    "## Export summary",
    "",
    `- Rides: ${sortedRides.length}`,
    `- Total moving time: ${duration(totalSeconds)}`,
    "",
    "## Method",
    "",
    ...METHOD_DEFINITIONS.flatMap((method) => [
      `### ${method.id} · ${method.title}`,
      "",
      `- Formula: \`${method.formula}\``,
      `- Interpretation: ${method.note}`,
      "",
    ]),
    "## Ride log",
    "",
  ];

  if (!sortedRides.length) lines.push("No rides are currently available.", "");

  sortedRides.forEach((ride) => {
    const environment = ride.environment === "virtual" ? "Virtual / Indoor" : ride.environment === "indoor" || (ride.environment === undefined && ride.indoor) ? "Indoor" : "Outdoor";
    const workoutSubtype = ride.workoutSubtype === "trainer_workout" ? "Trainer Workout" : ride.workoutSubtype === "race" ? "Race" : "None";
    const decoupling = ride.decouplingEligible && ride.decoupling !== null
      ? `${finite(ride.decoupling, 1, false)}%`
      : "Not suitable for interpretation";
    lines.push(
      `### ${clean(ride.date)} · ${clean(ride.name)}`,
      "",
      `- Ride ID: \`${clean(ride.id)}\``,
      `- Type: ${clean(ride.type)}`,
      `- Source: ${clean(ride.source)}`,
      `- Route/course: ${clean(ride.route)}`,
      `- Environment: ${environment}`,
      `- Workout subtype: ${workoutSubtype}`,
      `- Distance: ${finite(ride.distanceMiles, 1)} mi`,
      `- Moving time: ${duration(ride.movingTimeSeconds)}`,
      `- Elevation gain: ${finite(ride.elevationFeet)} ft`,
      `- Average power: ${finite(ride.averagePower)} W`,
      `- Normalized power: ${finite(ride.normalizedPower)} W`,
      `- Maximum power: ${finite(ride.maximumPower)} W`,
      `- Average heart rate: ${finite(ride.averageHeartRate)} bpm`,
      `- Maximum heart rate: ${finite(ride.maximumHeartRate)} bpm`,
      `- Average cadence: ${finite(ride.averageCadence)} rpm`,
      `- Maximum cadence: ${finite(ride.maximumCadence)} rpm`,
      `- Training load: ${finite(ride.trainingLoad)}`,
      `- Intensity factor: ${finite(ride.intensityFactor, 3)}`,
      `- FTP at ride: ${finite(ride.ftpAtRideWatts)} W`,
      `- FTP snapshot source: ${clean(ride.ftpSnapshotSource ?? "Not available")}`,
      `- Watts / heartbeat: ${finite(ride.powerHeartRateRatio, 3)}`,
      `- Aerobic decoupling: ${decoupling}`,
      `- Decoupling eligibility: ${ride.decouplingEligible ? "Eligible" : `Not eligible — ${clean(ride.decouplingEligibilityReason ?? "Reason unavailable")}`}`,
      `- Stopped time: ${finite(ride.stoppedPercent, 1, false)}%`,
      `- Variability index: ${finite(ride.variabilityIndex, 3)}`,
      `- Cadence standard deviation: ${finite(ride.cadenceStddev, 1)} rpm`,
      `- Cadence in 85–90 rpm target: ${finite(ride.cadenceTargetPercent, 1, false)}%`,
      `- Cadence in acceptable band: ${finite(ride.cadenceAcceptablePercent, 1, false)}%`,
      `- Cadence below band: ${finite(ride.cadenceLowPercent, 1, false)}%`,
      `- Cadence above band: ${finite(ride.cadenceHighPercent, 1, false)}%`,
      `- First 15-minute heart rate: ${finite(ride.first15HeartRate, 0)} bpm`,
      `- Final 15-minute heart rate: ${finite(ride.final15HeartRate, 0)} bpm`,
      `- Notes: ${clean(ride.note)}`,
      "",
    );
  });

  lines.push("---", "", "Generated by Cycling Analytics. Calculated guidance is informational and not a medical diagnosis.", "");
  return lines.join("\n");
}

export function cyclingMarkdownFilename(generatedAt = new Date()): string {
  return `cycling-analytics-${generatedAt.toISOString().slice(0, 10)}.md`;
}

export function cyclingRideMarkdownFilename(ride: Pick<MarkdownRide, "date" | "name">): string {
  const safeDate = /^\d{4}-\d{2}-\d{2}$/.test(ride.date) ? ride.date : "ride";
  const slug = ride.name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "activity";
  return `cycling-analytics-${safeDate}-${slug}.md`;
}
