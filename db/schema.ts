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
  lthrBpm: integer("lthr_bpm"),
  lthrSource: text("lthr_source"),
  lthrConfidence: text("lthr_confidence", { enum: ["low", "moderate", "high"] }),
  lthrSourceRideId: text("lthr_source_ride_id"),
  lthrEffectiveAt: text("lthr_effective_at"),
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
    rideContext: text("ride_context", { enum: ["ordinary", "benchmark", "structured_workout", "race", "group_ride"] })
      .notNull()
      .default("ordinary"),
    rideContextSource: text("ride_context_source").notNull().default("legacy"),
    classificationConfidence: text("classification_confidence", { enum: ["low", "moderate", "high"] })
      .notNull()
      .default("low"),
    classificationReason: text("classification_reason").notNull().default("Legacy classification; reclassify to add evidence."),
    classificationVersion: text("classification_version").notNull().default("legacy"),
    timezone: text("timezone"),
    rideType: text("ride_type").notNull().default("unknown"),
    rideTypeSource: text("ride_type_source").notNull().default("legacy"),
    indoor: integer("indoor", { mode: "boolean" }).notNull().default(false),
    environment: text("environment", { enum: ["virtual", "indoor", "outdoor"] }).notNull().default("outdoor"),
    workoutSubtype: text("workout_subtype", { enum: ["trainer_workout", "race"] }),
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
    ftpSnapshotSource: text("ftp_snapshot_source").notNull().default("current_at_import"),
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
    index("idx_rides_rider_source_file").on(table.riderId, table.sourceFileId),
    uniqueIndex("idx_rides_rider_external").on(table.riderId, table.externalId),
    index("idx_rides_rider_type_started").on(table.riderId, table.rideType, table.startedAt),
  ],
);

export const lthrHistory = sqliteTable(
  "lthr_history",
  {
    id: text("id").primaryKey(),
    riderId: text("rider_id").notNull().references(() => riders.id, { onDelete: "cascade" }),
    effectiveAt: text("effective_at").notNull(),
    lthrBpm: integer("lthr_bpm").notNull(),
    source: text("source", { enum: ["manual", "ride_candidate", "field_test"] }).notNull(),
    sourceRideId: text("source_ride_id").references(() => rides.id, { onDelete: "set null" }),
    confidence: text("confidence", { enum: ["low", "moderate", "high"] }).notNull(),
    algorithmVersion: text("algorithm_version"),
    notes: text("notes").notNull().default(""),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("idx_lthr_history_rider_effective").on(table.riderId, table.effectiveAt)],
);

export const activityStreams = sqliteTable("activity_streams", {
  rideId: text("ride_id").primaryKey().references(() => rides.id, { onDelete: "cascade" }),
  r2Key: text("r2_key").notNull(),
  encoding: text("encoding").notNull().default("json+gzip"),
  sampleCount: integer("sample_count").notNull(),
  availableStreamsJson: text("available_streams_json").notNull().default("[]"),
  streamSampleCountsJson: text("stream_sample_counts_json").notNull().default("{}"),
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
  decouplingEligible: integer("decoupling_eligible", { mode: "boolean" }).notNull().default(false),
  decouplingConfidence: text("decoupling_confidence", { enum: ["none", "low", "moderate", "high"] }).notNull().default("none"),
  decouplingEligibilityReason: text("decoupling_eligibility_reason").notNull().default("Detailed power and heart-rate streams are required."),
  stoppedPercent: real("stopped_percent"),
  cadenceStddev: real("cadence_stddev"),
  cadenceTargetPercent: real("cadence_target_percent"),
  cadenceAcceptablePercent: real("cadence_acceptable_percent"),
  cadenceLowPercent: real("cadence_low_percent"),
  cadenceHighPercent: real("cadence_high_percent"),
  first15HeartRateBpm: real("first_15_heart_rate_bpm"),
  final15HeartRateBpm: real("final_15_heart_rate_bpm"),
  heartRateThresholdBpm: integer("heart_rate_threshold_bpm"),
  heartRateSampleCount: integer("heart_rate_sample_count").notNull().default(0),
  heartRateZone1Percent: real("heart_rate_zone_1_percent"),
  heartRateZone2Percent: real("heart_rate_zone_2_percent"),
  heartRateZone3Percent: real("heart_rate_zone_3_percent"),
  heartRateZone4Percent: real("heart_rate_zone_4_percent"),
  heartRateZone5Percent: real("heart_rate_zone_5_percent"),
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

export const riderGoals = sqliteTable(
  "rider_goals",
  {
    id: text("id").primaryKey(),
    riderId: text("rider_id").notNull().references(() => riders.id, { onDelete: "cascade" }),
    targetFtpWatts: integer("target_ftp_watts").notNull(),
    status: text("status", { enum: ["active", "achieved", "archived"] }).notNull().default("active"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    achievedAt: text("achieved_at"),
  },
  (table) => [index("idx_rider_goals_rider_status").on(table.riderId, table.status)],
);

export const externalConnections = sqliteTable(
  "external_connections",
  {
    id: text("id").primaryKey(),
    riderId: text("rider_id").notNull().references(() => riders.id, { onDelete: "cascade" }),
    provider: text("provider", { enum: ["strava", "garmin"] }).notNull(),
    externalAthleteId: text("external_athlete_id"),
    displayName: text("display_name"),
    expiresAt: integer("expires_at"),
    scopes: text("scopes").notNull().default(""),
    lastSyncedAt: text("last_synced_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("idx_external_connections_rider_provider").on(table.riderId, table.provider),
    uniqueIndex("idx_external_connections_provider_athlete").on(table.provider, table.externalAthleteId),
  ],
);

export const oauthStates = sqliteTable(
  "oauth_states",
  {
    state: text("state").primaryKey(),
    riderId: text("rider_id").notNull().references(() => riders.id, { onDelete: "cascade" }),
    provider: text("provider", { enum: ["strava"] }).notNull(),
    expiresAt: integer("expires_at").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("idx_oauth_states_rider_expires").on(table.riderId, table.expiresAt)],
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
    bodyCondition: text("body_condition", { enum: ["normal", "mild_soreness", "significant_soreness", "pain_concern", "illness"] }),
    painLocation: text("pain_location", { enum: ["unspecified", "knee", "back", "neck_shoulders", "hands_wrists", "hips", "saddle_contact", "other"] }),
    painSeverity: integer("pain_severity"),
    illnessSeverity: integer("illness_severity"),
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

export const rideIdeas = sqliteTable(
  "ride_ideas",
  {
    id: text("id").primaryKey(),
    riderId: text("rider_id").notNull().references(() => riders.id, { onDelete: "cascade" }),
    version: text("version").notNull(),
    dateIso: text("date_iso").notNull(),
    status: text("status", { enum: ["selected", "completed", "replaced", "dismissed"] }).notNull().default("selected"),
    setting: text("setting", { enum: ["indoor", "outdoor"] }).notNull(),
    routeId: text("route_id").notNull(),
    routeName: text("route_name").notNull(),
    routeProvider: text("route_provider", { enum: ["zwift", "brouter"] }).notNull(),
    routeDetailsJson: text("route_details_json").notNull().default("{}"),
    intentionVersion: text("intention_version").notNull(),
    intentionMode: text("intention_mode", { enum: ["rest", "recovery", "endurance", "tempo"] }).notNull(),
    commitmentMinutes: integer("commitment_minutes").notNull(),
    intentionJson: text("intention_json").notNull(),
    ftpWatts: integer("ftp_watts").notNull(),
    weightKg: real("weight_kg").notNull(),
    lthrBpm: integer("lthr_bpm"),
    confidence: text("confidence", { enum: ["low", "moderate", "high"] }).notNull(),
    evidenceRationale: text("evidence_rationale").notNull(),
    completedRideId: text("completed_ride_id").references(() => rides.id, { onDelete: "set null" }),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("idx_ride_ideas_rider_date").on(table.riderId, table.dateIso),
    index("idx_ride_ideas_rider_status_date").on(table.riderId, table.status, table.dateIso),
    index("idx_ride_ideas_completed_ride").on(table.completedRideId),
  ],
);

export const coachReflections = sqliteTable(
  "coach_reflections",
  {
    id: text("id").primaryKey(),
    riderId: text("rider_id").notNull().references(() => riders.id, { onDelete: "cascade" }),
    rideIdeaId: text("ride_idea_id").notNull().references(() => rideIdeas.id, { onDelete: "cascade" }),
    rideIdeaUpdatedAt: text("ride_idea_updated_at").notNull().default(""),
    rideId: text("ride_id").notNull().references(() => rides.id, { onDelete: "cascade" }),
    dateIso: text("date_iso").notNull(),
    reflectionVersion: text("reflection_version").notNull(),
    matchConfidence: text("match_confidence", { enum: ["low", "moderate", "high"] }).notNull(),
    reflectionJson: text("reflection_json").notNull(),
    beforeMode: text("before_mode", { enum: ["rest", "recovery", "endurance", "tempo"] }).notNull(),
    nextMode: text("next_mode", { enum: ["rest", "recovery", "endurance", "tempo"] }).notNull(),
    adaptationVersion: text("adaptation_version").notNull(),
    adaptationSummary: text("adaptation_summary").notNull(),
    adaptationReasonsJson: text("adaptation_reasons_json").notNull().default("[]"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("idx_coach_reflections_idea_revision").on(table.rideIdeaId, table.rideIdeaUpdatedAt),
    index("idx_coach_reflections_rider_date").on(table.riderId, table.dateIso),
    index("idx_coach_reflections_ride").on(table.rideId),
  ],
);
