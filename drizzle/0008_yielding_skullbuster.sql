ALTER TABLE `rides` ADD `ride_context` text DEFAULT 'ordinary' NOT NULL;--> statement-breakpoint
ALTER TABLE `rides` ADD `ride_context_source` text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE `rides` ADD `classification_confidence` text DEFAULT 'low' NOT NULL;--> statement-breakpoint
ALTER TABLE `rides` ADD `classification_reason` text DEFAULT 'Legacy classification; reclassify to add evidence.' NOT NULL;--> statement-breakpoint
ALTER TABLE `rides` ADD `classification_version` text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
UPDATE `rides` SET `ride_context` = 'benchmark', `ride_context_source` = CASE WHEN `ride_type_source` = 'manual' THEN 'manual' ELSE 'legacy_inferred' END, `classification_reason` = 'Migrated from the legacy Zone 2 benchmark label.' WHERE `ride_type` = 'Zone 2 benchmark';--> statement-breakpoint
UPDATE `rides` SET `ride_context` = 'race', `ride_context_source` = 'legacy_inferred', `classification_reason` = 'Migrated from the stored race subtype.' WHERE `ride_context` = 'ordinary' AND `workout_subtype` = 'race';--> statement-breakpoint
UPDATE `rides` SET `ride_context` = 'structured_workout', `ride_context_source` = 'legacy_inferred', `classification_reason` = 'Migrated from the stored trainer workout subtype.' WHERE `ride_context` = 'ordinary' AND `workout_subtype` = 'trainer_workout';--> statement-breakpoint
UPDATE `rides` SET `ride_type` = 'Zone 2' WHERE `ride_type` = 'Zone 2 benchmark';
