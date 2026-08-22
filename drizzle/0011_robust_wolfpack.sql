CREATE TABLE `portal_store_listings` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`category` text NOT NULL,
	`subcategory` text NOT NULL,
	`price_cents` integer,
	`address` text NOT NULL,
	`cover_image` text NOT NULL,
	`images_json` text DEFAULT '[]' NOT NULL,
	`attributes_json` text DEFAULT '{}' NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`featured` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `portal_store_listings_store_idx` ON `portal_store_listings` (`store_id`,`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `portal_virtual_stores` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`type` text DEFAULT 'general' NOT NULL,
	`logo_url` text,
	`description` text DEFAULT '' NOT NULL,
	`plan_code` text DEFAULT 'store-free' NOT NULL,
	`ad_limit` integer DEFAULT 50 NOT NULL,
	`integration_type` text DEFAULT 'manual' NOT NULL,
	`feed_url` text,
	`partner_name` text,
	`email` text DEFAULT '' NOT NULL,
	`whatsapp` text DEFAULT '' NOT NULL,
	`city` text DEFAULT '' NOT NULL,
	`state` text DEFAULT '' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`is_demo` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `portal_virtual_stores_user_id_unique` ON `portal_virtual_stores` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `portal_virtual_stores_slug_unique` ON `portal_virtual_stores` (`slug`);--> statement-breakpoint
CREATE INDEX `portal_virtual_stores_type_idx` ON `portal_virtual_stores` (`type`,`active`,`name`);
