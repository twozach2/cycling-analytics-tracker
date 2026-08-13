CREATE TABLE `lthr_history` (
	`id` text PRIMARY KEY NOT NULL,
	`rider_id` text NOT NULL,
	`effective_at` text NOT NULL,
	`lthr_bpm` integer NOT NULL,
	`source` text NOT NULL,
	`source_ride_id` text,
	`confidence` text NOT NULL,
	`algorithm_version` text,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`rider_id`) REFERENCES `riders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_ride_id`) REFERENCES `rides`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_lthr_history_rider_effective` ON `lthr_history` (`rider_id`,`effective_at`);--> statement-breakpoint
ALTER TABLE `riders` ADD `lthr_source` text;--> statement-breakpoint
ALTER TABLE `riders` ADD `lthr_confidence` text;--> statement-breakpoint
ALTER TABLE `riders` ADD `lthr_source_ride_id` text;--> statement-breakpoint
ALTER TABLE `riders` ADD `lthr_effective_at` text;