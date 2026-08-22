CREATE TABLE `portal_ai_review_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`total` integer DEFAULT 0 NOT NULL,
	`processed` integer DEFAULT 0 NOT NULL,
	`changed` integer DEFAULT 0 NOT NULL,
	`failed` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `portal_ai_review_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`job_id` text NOT NULL,
	`listing_id` text NOT NULL,
	`title` text NOT NULL,
	`old_category` text NOT NULL,
	`old_subcategory` text NOT NULL,
	`new_category` text,
	`new_subcategory` text,
	`status` text NOT NULL,
	`message` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `portal_ai_review_logs_job_idx` ON `portal_ai_review_logs` (`job_id`,`id`);--> statement-breakpoint
CREATE TABLE `portal_ai_review_queue` (
	`job_id` text NOT NULL,
	`listing_id` text NOT NULL,
	`source` text NOT NULL,
	`position` integer NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`current_category` text NOT NULL,
	`current_subcategory` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `portal_ai_review_queue_job_listing_idx` ON `portal_ai_review_queue` (`job_id`,`listing_id`);--> statement-breakpoint
CREATE INDEX `portal_ai_review_queue_status_idx` ON `portal_ai_review_queue` (`job_id`,`status`,`position`);--> statement-breakpoint
CREATE TABLE `portal_listing_ai_overrides` (
	`listing_id` text PRIMARY KEY NOT NULL,
	`category` text NOT NULL,
	`subcategory` text NOT NULL,
	`confidence` integer NOT NULL,
	`reason` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
UPDATE `portal_listings`
SET `address` = 'Belo Horizonte, Minas Gerais, Brasil',
    `latitude` = '-19.9166813',
    `longitude` = '-43.9344931',
    `updated_at` = CURRENT_TIMESTAMP;
