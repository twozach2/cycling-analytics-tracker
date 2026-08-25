CREATE TABLE `coach_reflections` (
	`id` text PRIMARY KEY NOT NULL,
	`rider_id` text NOT NULL,
	`ride_idea_id` text NOT NULL,
	`ride_id` text NOT NULL,
	`date_iso` text NOT NULL,
	`reflection_version` text NOT NULL,
	`match_confidence` text NOT NULL,
	`reflection_json` text NOT NULL,
	`before_mode` text NOT NULL,
	`next_mode` text NOT NULL,
	`adaptation_version` text NOT NULL,
	`adaptation_summary` text NOT NULL,
	`adaptation_reasons_json` text DEFAULT '[]' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`rider_id`) REFERENCES `riders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`ride_idea_id`) REFERENCES `ride_ideas`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`ride_id`) REFERENCES `rides`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_coach_reflections_ride_idea` ON `coach_reflections` (`ride_idea_id`);--> statement-breakpoint
CREATE INDEX `idx_coach_reflections_rider_date` ON `coach_reflections` (`rider_id`,`date_iso`);--> statement-breakpoint
CREATE INDEX `idx_coach_reflections_ride` ON `coach_reflections` (`ride_id`);