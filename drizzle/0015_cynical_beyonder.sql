CREATE TABLE `portal_analytics_pageviews` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`path` text NOT NULL,
	`listing_id` text,
	`occurred_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `portal_analytics_pageviews_occurred_idx` ON `portal_analytics_pageviews` (`occurred_at`);--> statement-breakpoint
CREATE INDEX `portal_analytics_pageviews_path_idx` ON `portal_analytics_pageviews` (`path`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `portal_analytics_pageviews_listing_idx` ON `portal_analytics_pageviews` (`listing_id`,`occurred_at`);--> statement-breakpoint
CREATE TABLE `portal_analytics_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`first_seen_at` text NOT NULL,
	`last_seen_at` text NOT NULL,
	`landing_path` text NOT NULL,
	`device_type` text NOT NULL,
	`pageviews` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `portal_analytics_sessions_last_seen_idx` ON `portal_analytics_sessions` (`last_seen_at`);