CREATE TABLE `portal_listings` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`negotiation_type` text NOT NULL,
	`category` text NOT NULL,
	`subcategory` text NOT NULL,
	`price_cents` integer,
	`monthly_rent_cents` integer,
	`iptu_cents` integer,
	`condo_cents` integer,
	`negotiable` integer DEFAULT false NOT NULL,
	`address` text NOT NULL,
	`latitude` text,
	`longitude` text,
	`display_name` text NOT NULL,
	`whatsapp` text NOT NULL,
	`attributes_json` text DEFAULT '{}' NOT NULL,
	`features_json` text DEFAULT '[]' NOT NULL,
	`images_json` text DEFAULT '[]' NOT NULL,
	`cover_image` text NOT NULL,
	`publication_type` text DEFAULT 'free' NOT NULL,
	`featured_plan` text,
	`featured_until` text,
	`status` text DEFAULT 'pending_review' NOT NULL,
	`payment_provider` text,
	`payment_reference` text,
	`payment_status` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `portal_listings_user_id_idx` ON `portal_listings` (`user_id`);--> statement-breakpoint
CREATE INDEX `portal_listings_status_idx` ON `portal_listings` (`status`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `portal_listings_payment_reference_idx` ON `portal_listings` (`payment_reference`);