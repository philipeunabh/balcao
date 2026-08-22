ALTER TABLE `portal_listings` ADD `payment_method` text;--> statement-breakpoint
ALTER TABLE `portal_listings` ADD `payment_amount_cents` integer;--> statement-breakpoint
ALTER TABLE `portal_listings` ADD `payment_expires_at` text;