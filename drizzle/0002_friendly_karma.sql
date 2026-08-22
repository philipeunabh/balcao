CREATE TABLE `portal_customer_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `portal_registration_verifications` (
	`id` text PRIMARY KEY NOT NULL,
	`account_type` text NOT NULL,
	`tax_id` text NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`whatsapp` text NOT NULL,
	`password_salt` text NOT NULL,
	`password_hash` text NOT NULL,
	`code_hash` text NOT NULL,
	`expires_at` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `portal_users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_type` text NOT NULL,
	`tax_id` text NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`whatsapp` text NOT NULL,
	`password_salt` text NOT NULL,
	`password_hash` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`plan_code` text DEFAULT 'free-10' NOT NULL,
	`plan_name` text DEFAULT 'Plano Gratuito' NOT NULL,
	`ad_limit` integer DEFAULT 10 NOT NULL,
	`active_ads` integer DEFAULT 0 NOT NULL,
	`verified_at` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `portal_users_tax_id_unique` ON `portal_users` (`tax_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `portal_users_email_unique` ON `portal_users` (`email`);