DROP INDEX `idx_coach_reflections_ride_idea`;--> statement-breakpoint
ALTER TABLE `coach_reflections` ADD `ride_idea_updated_at` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_coach_reflections_idea_revision` ON `coach_reflections` (`ride_idea_id`,`ride_idea_updated_at`);