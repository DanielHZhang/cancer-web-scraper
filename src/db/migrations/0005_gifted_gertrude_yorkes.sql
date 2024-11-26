DROP INDEX IF EXISTS `drugs_name_unique`;--> statement-breakpoint
CREATE UNIQUE INDEX `drugs_name_cancerId_unique` ON `drugs` (`name`,`cancerId`);