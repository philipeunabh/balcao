ALTER TABLE `portal_store_listings` ADD `external_url` text;--> statement-breakpoint
ALTER TABLE `portal_virtual_stores` ADD `website_url` text;--> statement-breakpoint
ALTER TABLE `portal_virtual_stores` ADD `address` text DEFAULT '' NOT NULL;