import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const riders = sqliteTable("riders", {
  id: text("id").primaryKey(),
  displayName: text("display_name").notNull().default("Rider"),
  defaultFtpWatts: integer("default_ftp_watts"),
  defaultWeightKg: real("default_weight_kg"),
  preferredCadenceLow: integer("preferred_cadence_low").notNull().default(85),
  preferredCadenceHigh: integer("preferred_cadence_high").notNull().default(90),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const sourceFiles = sqliteTable(
  "source_files",
  {
    id: text("id").primaryKey(),
    riderId: text("rider_id").notNull().references(() => riders.id, { onDelete: "cascade" }),
    filename: text("filename").notNull(),
    fileType: text("file_type", { enum: ["fit", "tcx", "gpx", "csv", "unknown"] }).notNull(),
    sha256: text("sha256").notNull(),
    r2Key: text("r2_key").notNull(),
    byteSize: integer("byte_size").notNull(),
    importStatus: text("import_status", { enum: ["uploaded", "parsed", "reviewed", "failed"] })
      .notNull()
      .default("uploaded"),
    importError: text("import_error"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("idx_source_files_rider_sha256").on(table.riderId, table.sha256),
    index("idx_source_files_rider_created").on(table.riderId, table.createdAt),
  ],
);

export const rides = sqliteTable(
  "rides",
  {
    id: text("id").primaryKey(),
    riderId: text("rider_id").notNull().references(() => riders.id, { onDelete: "cascade" }),
    sourceFileId: text("source_file_id").references(() => sourceFiles.id, { onDelete: "set null" }),
    externalId: text("external_id"),
    source: text("source", { enum: ["strava_export", "zwift", "gpx", "tcx", "fit", "manual"] }).notNull(),
    name: text("name").notNull(),
    startedAt: text("started_at").notNull(),
    timezone: text("timezone"),
    rideType: text("ride_type").notNull().default("unknown"),
    indoor: integer("indoor", { mode: "boolean" }).notNull().default(false),
    routeName: text("route_name"),
    activityUrl: text("activity_url"),
    distanceM: real("distance_m"),
    movingTimeS: integer("moving_time_s"),
    elapsedTimeS: integer("elapsed_time_s"),
    elevationGainM: real("elevation_gain_m"),
    averageSpeedMps: real("average_speed_mps"),
    maximumSpeedMps: real("maximum_speed_mps"),
    averageHeartRateBpm: real("average_heart_rate_bpm"),
    maximumHeartRateBpm: real("maximum_heart_rate_bpm"),
    averageCadenceRpm: real("average_cadence_rpm"),
    maximumCadenceRpm: real("maximum_cadence_rpm"),
    averagePowerWatts: real("average_power_watts"),
    maximumPowerWatts: real("maximum_power_watts"),
    normalizedPowerWatts: real("normalized_power_watts"),
    normalizedPowerSource: text("normalized_power_source", { enum: ["recorded", "computed", "unavailable"] })
      .notNull()
      .default("unavailable"),
    totalWorkKj: real("total_work_kj"),
    calories: integer("calories"),
    ftpAtRideWatts: integer("ftp_at_ride_watts"),
    weightAtRideKg: real("weight_at_ride_kg"),
    perceivedEffort: integer("perceived_effort"),
    kneePainBefore: integer("knee_pain_before"),
    kneePainDuring: integer("knee_pain_during"),
    kneePainAfter: integer("knee_pain_after"),
    footNumbness: integer("foot_numbness"),
    notes: text("notes").notNull().default(""),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_rides_rider_started").on(table.riderId, table.startedAt),
    uniqueIndex("idx_rides_rider_external").on(table.riderId, table.externalId),
    index("idx_rides_rider_type_started").on(table.riderId, table.rideType, table.startedAt),
  ],
);

export const activityStreams = sqliteTable("activity_streams", {
  rideId: text("ride_id").primaryKey().references(() => rides.id, { onDelete: "cascade" }),
  r2Key: text("r2_key").notNull(),
  encoding: text("encoding").notNull().default("json+gzip"),
  sampleCount: integer("sample_count").notNull(),
  availableStreamsJson: text("available_streams_json").notNull().default("[]"),
  startedAt: text("started_at"),
  endedAt: text("ended_at"),
});

export const rideMetrics = sqliteTable("ride_metrics", {
  rideId: text("ride_id").primaryKey().references(() => rides.id, { onDelete: "cascade" }),
  powerHeartRateRatio: real("power_heart_rate_ratio"),
  powerToWeightRatio: real("power_to_weight_ratio"),
  intensityFactor: real("intensity_factor"),
  intensityIsEstimated: integer("intensity_is_estimated", { mode: "boolean" }).notNull().default(false),
  trainingLoad: real("training_load"),
  trainingLoadIsEstimated: integer("training_load_is_estimated", { mode: "boolean" }).notNull().default(false),
  variabilityIndex: real("variability_index"),
  aerobicDecouplingPercent: real("aerobic_decoupling_percent"),
  stoppedPercent: real("stopped_percent"),
  cadenceStddev: real("cadence_stddev"),
  cadenceTargetPercent: real("cadence_target_percent"),
  algorithmVersion: text("algorithm_version").notNull().default("phase1.1"),
  dataQuality: text("data_quality", { enum: ["high", "medium", "low"] }).notNull().default("medium"),
  calculatedAt: text("calculated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const powerDuration = sqliteTable(
  "power_duration",
  {
    rideId: text("ride_id").notNull().references(() => rides.id, { onDelete: "cascade" }),
    durationSeconds: integer("duration_seconds").notNull(),
    bestPowerWatts: real("best_power_watts").notNull(),
  },
  (table) => [primaryKey({ columns: [table.rideId, table.durationSeconds] })],
);

export const ftpHistory = sqliteTable(
  "ftp_history",
  {
    id: text("id").primaryKey(),
    riderId: text("rider_id").notNull().references(() => riders.id, { onDelete: "cascade" }),
    effectiveAt: text("effective_at").notNull(),
    ftpWatts: integer("ftp_watts").notNull(),
    weightKg: real("weight_kg"),
    source: text("source").notNull(),
    notes: text("notes").notNull().default(""),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("idx_ftp_history_rider_effective").on(table.riderId, table.effectiveAt)],
);

export const recoveryLogs = sqliteTable(
  "recovery_logs",
  {
    id: text("id").primaryKey(),
    riderId: text("rider_id").notNull().references(() => riders.id, { onDelete: "cascade" }),
    loggedAt: text("logged_at").notNull(),
    sleepQuality: integer("sleep_quality"),
    legFreshness: text("leg_freshness", { enum: ["fresh", "normal", "heavy", "dead"] }),
    motivation: integer("motivation"),
    generalSoreness: integer("general_soreness"),
    kneePain: integer("knee_pain"),
    restingHeartRate: integer("resting_heart_rate"),
    notes: text("notes").notNull().default(""),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("idx_recovery_logs_rider_logged").on(table.riderId, table.loggedAt)],
);

export const recoveryRecommendations = sqliteTable("recovery_recommendations", {
  id: text("id").primaryKey(),
  rideId: text("ride_id").notNull().references(() => rides.id, { onDelete: "cascade" }),
  minimumHours: integer("minimum_hours").notNull(),
  maximumHours: integer("maximum_hours").notNull(),
  status: text("status").notNull(),
  nextSession: text("next_session").notNull(),
  reasonsJson: text("reasons_json").notNull().default("[]"),
  algorithmVersion: text("algorithm_version").notNull().default("phase1.1"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
