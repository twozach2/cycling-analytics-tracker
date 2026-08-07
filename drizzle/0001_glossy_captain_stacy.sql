CREATE INDEX `idx_rides_rider_source_file` ON `rides` (`rider_id`,`source_file_id`);
--> statement-breakpoint
PRAGMA optimize;
