CREATE TABLE `external_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`rider_id` text NOT NULL,
	`provider` text NOT NULL,
	`external_athlete_id` text,
	`display_name` text,
	`access_token` text,
	`refresh_token` text,
	`expires_at` integer,
	`scopes` text DEFAULT '' NOT NULL,
	`last_synced_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`rider_id`) REFERENCES `riders`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_external_connections_rider_provider` ON `external_connections` (`rider_id`,`provider`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_external_connections_provider_athlete` ON `external_connections` (`provider`,`external_athlete_id`);--> statement-breakpoint
CREATE TABLE `oauth_states` (
	`state` text PRIMARY KEY NOT NULL,
	`rider_id` text NOT NULL,
	`provider` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`rider_id`) REFERENCES `riders`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_oauth_states_rider_expires` ON `oauth_states` (`rider_id`,`expires_at`);--> statement-breakpoint
CREATE TABLE `rider_goals` (
	`id` text PRIMARY KEY NOT NULL,
	`rider_id` text NOT NULL,
	`target_ftp_watts` integer NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`achieved_at` text,
	FOREIGN KEY (`rider_id`) REFERENCES `riders`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_rider_goals_rider_status` ON `rider_goals` (`rider_id`,`status`);
--> statement-breakpoint
PRAGMA optimize;
