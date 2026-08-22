CREATE TABLE `portal_newsletter_campaigns` (
	`id` text PRIMARY KEY NOT NULL,
	`subject` text NOT NULL,
	`preheader` text DEFAULT '' NOT NULL,
	`heading` text DEFAULT '' NOT NULL,
	`intro` text DEFAULT '' NOT NULL,
	`html` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`recipient_count` integer DEFAULT 0 NOT NULL,
	`sent_count` integer DEFAULT 0 NOT NULL,
	`failed_count` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`sent_at` text
);
--> statement-breakpoint
CREATE INDEX `portal_newsletter_campaigns_created_idx` ON `portal_newsletter_campaigns` (`created_at`);--> statement-breakpoint
CREATE TABLE `portal_newsletter_subscribers` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`source` text DEFAULT 'site_popup' NOT NULL,
	`unsubscribe_token` text NOT NULL,
	`consent_at` text NOT NULL,
	`welcome_sent_at` text,
	`unsubscribed_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `portal_newsletter_subscribers_email_unique` ON `portal_newsletter_subscribers` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `portal_newsletter_subscribers_unsubscribe_token_unique` ON `portal_newsletter_subscribers` (`unsubscribe_token`);--> statement-breakpoint
CREATE INDEX `portal_newsletter_subscribers_status_idx` ON `portal_newsletter_subscribers` (`status`,`created_at`);