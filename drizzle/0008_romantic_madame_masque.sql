CREATE TABLE `portal_import_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`source_url` text NOT NULL,
	`status` text NOT NULL,
	`total` integer DEFAULT 0 NOT NULL,
	`processed` integer DEFAULT 0 NOT NULL,
	`imported` integer DEFAULT 0 NOT NULL,
	`updated` integer DEFAULT 0 NOT NULL,
	`failed` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `portal_import_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`job_id` text NOT NULL,
	`listing_id` text NOT NULL,
	`title` text NOT NULL,
	`category` text,
	`subcategory` text,
	`status` text NOT NULL,
	`message` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `portal_import_logs_job_idx` ON `portal_import_logs` (`job_id`,`id`);--> statement-breakpoint
CREATE TABLE `portal_import_queue` (
	`job_id` text NOT NULL,
	`listing_id` text NOT NULL,
	`position` integer NOT NULL,
	`payload_json` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `portal_import_queue_job_listing_idx` ON `portal_import_queue` (`job_id`,`listing_id`);--> statement-breakpoint
CREATE INDEX `portal_import_queue_status_idx` ON `portal_import_queue` (`job_id`,`status`,`position`);