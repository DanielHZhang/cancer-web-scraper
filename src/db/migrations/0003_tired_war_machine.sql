ALTER TABLE `drugs` ADD `fda` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `drugs` DROP COLUMN `fdaApproved`;--> statement-breakpoint
ALTER TABLE `drugs` DROP COLUMN `fdaEarliestApprovalDate`;