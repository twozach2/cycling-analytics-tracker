ALTER TABLE `ride_metrics` ADD `heart_rate_threshold_bpm` integer;--> statement-breakpoint
ALTER TABLE `ride_metrics` ADD `heart_rate_sample_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `ride_metrics` ADD `heart_rate_zone_1_percent` real;--> statement-breakpoint
ALTER TABLE `ride_metrics` ADD `heart_rate_zone_2_percent` real;--> statement-breakpoint
ALTER TABLE `ride_metrics` ADD `heart_rate_zone_3_percent` real;--> statement-breakpoint
ALTER TABLE `ride_metrics` ADD `heart_rate_zone_4_percent` real;--> statement-breakpoint
ALTER TABLE `ride_metrics` ADD `heart_rate_zone_5_percent` real;--> statement-breakpoint
ALTER TABLE `riders` ADD `lthr_bpm` integer;