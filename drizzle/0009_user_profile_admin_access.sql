ALTER TABLE `portal_users` ADD `profile_image_url` text;
--> statement-breakpoint
ALTER TABLE `portal_users` ADD `is_admin` integer DEFAULT 0 NOT NULL;
