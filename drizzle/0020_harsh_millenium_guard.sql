CREATE TABLE `portal_invoices` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`listing_id` text NOT NULL,
	`invoice_number` text NOT NULL,
	`listing_title` text NOT NULL,
	`description` text NOT NULL,
	`amount_cents` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`payment_method` text,
	`issued_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `portal_invoices_listing_id_unique` ON `portal_invoices` (`listing_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `portal_invoices_invoice_number_unique` ON `portal_invoices` (`invoice_number`);--> statement-breakpoint
CREATE INDEX `portal_invoices_user_id_idx` ON `portal_invoices` (`user_id`,`issued_at`);