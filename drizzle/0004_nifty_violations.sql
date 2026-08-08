ALTER TABLE `ride_metrics` ADD `decoupling_eligible` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `ride_metrics` ADD `decoupling_eligibility_reason` text DEFAULT 'Detailed power and heart-rate streams are required.' NOT NULL;--> statement-breakpoint
ALTER TABLE `rides` ADD `environment` text DEFAULT 'outdoor' NOT NULL;--> statement-breakpoint
ALTER TABLE `rides` ADD `workout_subtype` text;--> statement-breakpoint
ALTER TABLE `rides` ADD `ftp_snapshot_source` text DEFAULT 'current_at_import' NOT NULL;--> statement-breakpoint
UPDATE `rides` SET `environment` = CASE WHEN `indoor` = 1 THEN 'indoor' ELSE 'outdoor' END;--> statement-breakpoint
UPDATE `rides` SET `ftp_snapshot_source` = CASE WHEN `ftp_at_ride_watts` IS NOT NULL THEN 'legacy_import' ELSE 'unavailable' END;
