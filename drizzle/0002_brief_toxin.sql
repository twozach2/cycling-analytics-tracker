ALTER TABLE `ride_metrics` ADD `cadence_acceptable_percent` real;--> statement-breakpoint
ALTER TABLE `ride_metrics` ADD `cadence_low_percent` real;--> statement-breakpoint
ALTER TABLE `ride_metrics` ADD `cadence_high_percent` real;--> statement-breakpoint
ALTER TABLE `ride_metrics` ADD `first_15_heart_rate_bpm` real;--> statement-breakpoint
ALTER TABLE `ride_metrics` ADD `final_15_heart_rate_bpm` real;
--> statement-breakpoint
PRAGMA optimize;
