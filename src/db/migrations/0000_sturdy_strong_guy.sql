CREATE TABLE `cancers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`urls` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cancers_type_unique` ON `cancers` (`type`);--> statement-breakpoint
CREATE TABLE `drugs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`brandName` text NOT NULL,
	`genericName` text NOT NULL,
	`description` text,
	`therapyType` text,
	`fdaApproved` integer DEFAULT false,
	`fdaEarliestApprovalDate` integer,
	`urls` text NOT NULL,
	`dailyMed` text,
	`clinicalTrials` text,
	`cancerId` integer NOT NULL,
	FOREIGN KEY (`cancerId`) REFERENCES `cancers`(`id`) ON UPDATE no action ON DELETE cascade
);
