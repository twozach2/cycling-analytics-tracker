CREATE TABLE `ride_ideas` (
	`id` text PRIMARY KEY NOT NULL,
	`rider_id` text NOT NULL,
	`version` text NOT NULL,
	`date_iso` text NOT NULL,
	`status` text DEFAULT 'selected' NOT NULL,
	`setting` text NOT NULL,
	`route_id` text NOT NULL,
	`route_name` text NOT NULL,
	`route_provider` text NOT NULL,
	`route_details_json` text DEFAULT '{}' NOT NULL,
	`intention_version` text NOT NULL,
	`intention_mode` text NOT NULL,
	`commitment_minutes` integer NOT NULL,
	`intention_json` text NOT NULL,
	`ftp_watts` integer NOT NULL,
	`weight_kg` real NOT NULL,
	`lthr_bpm` integer,
	`confidence` text NOT NULL,
	`evidence_rationale` text NOT NULL,
	`completed_ride_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`rider_id`) REFERENCES `riders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`completed_ride_id`) REFERENCES `rides`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_ride_ideas_rider_date` ON `ride_ideas` (`rider_id`,`date_iso`);--> statement-breakpoint
CREATE INDEX `idx_ride_ideas_rider_status_date` ON `ride_ideas` (`rider_id`,`status`,`date_iso`);--> statement-breakpoint
CREATE INDEX `idx_ride_ideas_completed_ride` ON `ride_ideas` (`completed_ride_id`);