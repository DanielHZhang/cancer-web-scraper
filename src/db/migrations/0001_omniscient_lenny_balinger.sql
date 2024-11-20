ALTER TABLE `drugs` ADD `name` text NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `drugs_name_unique` ON `drugs` (`name`);