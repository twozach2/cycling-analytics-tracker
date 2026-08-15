ALTER TABLE `ride_metrics` ADD `decoupling_confidence` text DEFAULT 'none' NOT NULL;
--> statement-breakpoint
UPDATE `ride_metrics`
SET `decoupling_confidence` = CASE
  WHEN COALESCE((SELECT `moving_time_s` FROM `rides` WHERE `rides`.`id` = `ride_metrics`.`ride_id`), 0) >= 3600 THEN 'high'
  WHEN COALESCE((SELECT `moving_time_s` FROM `rides` WHERE `rides`.`id` = `ride_metrics`.`ride_id`), 0) >= 2700 THEN 'moderate'
  WHEN COALESCE((SELECT `moving_time_s` FROM `rides` WHERE `rides`.`id` = `ride_metrics`.`ride_id`), 0) >= 1800 THEN 'low'
  ELSE 'none'
END
WHERE `decoupling_eligible` = 1;
