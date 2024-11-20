PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_drugs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`brandName` text NOT NULL,
	`genericName` text NOT NULL,
	`description` text,
	`therapyType` text,
	`fdaApproved` integer DEFAULT false,
	`fdaEarliestApprovalDate` integer,
	`urls` text NOT NULL,
	`dailyMed` text DEFAULT '{}' NOT NULL,
	`clinicalTrials` text DEFAULT '{}' NOT NULL,
	`cancerId` integer NOT NULL,
	FOREIGN KEY (`cancerId`) REFERENCES `cancers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_drugs`("id", "name", "brandName", "genericName", "description", "therapyType", "fdaApproved", "fdaEarliestApprovalDate", "urls", "dailyMed", "clinicalTrials", "cancerId") SELECT "id", "name", "brandName", "genericName", "description", "therapyType", "fdaApproved", "fdaEarliestApprovalDate", "urls", "dailyMed", "clinicalTrials", "cancerId" FROM `drugs`;--> statement-breakpoint
DROP TABLE `drugs`;--> statement-breakpoint
ALTER TABLE `__new_drugs` RENAME TO `drugs`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `drugs_name_unique` ON `drugs` (`name`);