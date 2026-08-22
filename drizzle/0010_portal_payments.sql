CREATE TABLE `portal_payments` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`listing_id` text NOT NULL,
	`provider` text DEFAULT 'pagbank' NOT NULL,
	`provider_reference` text,
	`method` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`provider_status` text,
	`plan_code` text,
	`plan_label` text,
	`description` text NOT NULL,
	`card_brand` text,
	`card_last4` text,
	`paid_at` text,
	`expires_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `portal_payments_user_id_idx` ON `portal_payments` (`user_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `portal_payments_listing_id_idx` ON `portal_payments` (`listing_id`,`created_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX `portal_payments_provider_reference_idx` ON `portal_payments` (`provider_reference`);
