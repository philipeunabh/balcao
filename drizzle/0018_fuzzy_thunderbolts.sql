CREATE TABLE `portal_store_renewal_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`user_id` integer NOT NULL,
	`requested_plan_code` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `portal_store_renewal_requests_store_idx` ON `portal_store_renewal_requests` (`store_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `portal_virtual_stores` ADD `banner_url` text;--> statement-breakpoint
ALTER TABLE `portal_virtual_stores` ADD `primary_color` text DEFAULT '#d71920' NOT NULL;--> statement-breakpoint
ALTER TABLE `portal_virtual_stores` ADD `secondary_color` text DEFAULT '#17191e' NOT NULL;--> statement-breakpoint
ALTER TABLE `portal_virtual_stores` ADD `phone` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `portal_virtual_stores` ADD `social_links_json` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `portal_virtual_stores` ADD `plan_started_at` text;--> statement-breakpoint
ALTER TABLE `portal_virtual_stores` ADD `plan_ends_at` text;