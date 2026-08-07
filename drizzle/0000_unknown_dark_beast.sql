CREATE TABLE `activity_streams` (
	`ride_id` text PRIMARY KEY NOT NULL,
	`r2_key` text NOT NULL,
	`encoding` text DEFAULT 'json+gzip' NOT NULL,
	`sample_count` integer NOT NULL,
	`available_streams_json` text DEFAULT '[]' NOT NULL,
	`started_at` text,
	`ended_at` text,
	FOREIGN KEY (`ride_id`) REFERENCES `rides`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `ftp_history` (
	`id` text PRIMARY KEY NOT NULL,
	`rider_id` text NOT NULL,
	`effective_at` text NOT NULL,
	`ftp_watts` integer NOT NULL,
	`weight_kg` real,
	`source` text NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`rider_id`) REFERENCES `riders`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_ftp_history_rider_effective` ON `ftp_history` (`rider_id`,`effective_at`);--> statement-breakpoint
CREATE TABLE `power_duration` (
	`ride_id` text NOT NULL,
	`duration_seconds` integer NOT NULL,
	`best_power_watts` real NOT NULL,
	PRIMARY KEY(`ride_id`, `duration_seconds`),
	FOREIGN KEY (`ride_id`) REFERENCES `rides`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `recovery_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`rider_id` text NOT NULL,
	`logged_at` text NOT NULL,
	`sleep_quality` integer,
	`leg_freshness` text,
	`motivation` integer,
	`general_soreness` integer,
	`knee_pain` integer,
	`resting_heart_rate` integer,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`rider_id`) REFERENCES `riders`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_recovery_logs_rider_logged` ON `recovery_logs` (`rider_id`,`logged_at`);--> statement-breakpoint
CREATE TABLE `recovery_recommendations` (
	`id` text PRIMARY KEY NOT NULL,
	`ride_id` text NOT NULL,
	`minimum_hours` integer NOT NULL,
	`maximum_hours` integer NOT NULL,
	`status` text NOT NULL,
	`next_session` text NOT NULL,
	`reasons_json` text DEFAULT '[]' NOT NULL,
	`algorithm_version` text DEFAULT 'phase1.1' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`ride_id`) REFERENCES `rides`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `ride_metrics` (
	`ride_id` text PRIMARY KEY NOT NULL,
	`power_heart_rate_ratio` real,
	`power_to_weight_ratio` real,
	`intensity_factor` real,
	`intensity_is_estimated` integer DEFAULT false NOT NULL,
	`training_load` real,
	`training_load_is_estimated` integer DEFAULT false NOT NULL,
	`variability_index` real,
	`aerobic_decoupling_percent` real,
	`stopped_percent` real,
	`cadence_stddev` real,
	`cadence_target_percent` real,
	`algorithm_version` text DEFAULT 'phase1.1' NOT NULL,
	`data_quality` text DEFAULT 'medium' NOT NULL,
	`calculated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`ride_id`) REFERENCES `rides`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `riders` (
	`id` text PRIMARY KEY NOT NULL,
	`display_name` text DEFAULT 'Rider' NOT NULL,
	`default_ftp_watts` integer,
	`default_weight_kg` real,
	`preferred_cadence_low` integer DEFAULT 85 NOT NULL,
	`preferred_cadence_high` integer DEFAULT 90 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `rides` (
	`id` text PRIMARY KEY NOT NULL,
	`rider_id` text NOT NULL,
	`source_file_id` text,
	`external_id` text,
	`source` text NOT NULL,
	`name` text NOT NULL,
	`started_at` text NOT NULL,
	`timezone` text,
	`ride_type` text DEFAULT 'unknown' NOT NULL,
	`indoor` integer DEFAULT false NOT NULL,
	`route_name` text,
	`activity_url` text,
	`distance_m` real,
	`moving_time_s` integer,
	`elapsed_time_s` integer,
	`elevation_gain_m` real,
	`average_speed_mps` real,
	`maximum_speed_mps` real,
	`average_heart_rate_bpm` real,
	`maximum_heart_rate_bpm` real,
	`average_cadence_rpm` real,
	`maximum_cadence_rpm` real,
	`average_power_watts` real,
	`maximum_power_watts` real,
	`normalized_power_watts` real,
	`normalized_power_source` text DEFAULT 'unavailable' NOT NULL,
	`total_work_kj` real,
	`calories` integer,
	`ftp_at_ride_watts` integer,
	`weight_at_ride_kg` real,
	`perceived_effort` integer,
	`knee_pain_before` integer,
	`knee_pain_during` integer,
	`knee_pain_after` integer,
	`foot_numbness` integer,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`rider_id`) REFERENCES `riders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_file_id`) REFERENCES `source_files`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_rides_rider_started` ON `rides` (`rider_id`,`started_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_rides_rider_external` ON `rides` (`rider_id`,`external_id`);--> statement-breakpoint
CREATE INDEX `idx_rides_rider_type_started` ON `rides` (`rider_id`,`ride_type`,`started_at`);--> statement-breakpoint
CREATE TABLE `source_files` (
	`id` text PRIMARY KEY NOT NULL,
	`rider_id` text NOT NULL,
	`filename` text NOT NULL,
	`file_type` text NOT NULL,
	`sha256` text NOT NULL,
	`r2_key` text NOT NULL,
	`byte_size` integer NOT NULL,
	`import_status` text DEFAULT 'uploaded' NOT NULL,
	`import_error` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`rider_id`) REFERENCES `riders`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_source_files_rider_sha256` ON `source_files` (`rider_id`,`sha256`);--> statement-breakpoint
CREATE INDEX `idx_source_files_rider_created` ON `source_files` (`rider_id`,`created_at`);
--> statement-breakpoint
PRAGMA optimize;
