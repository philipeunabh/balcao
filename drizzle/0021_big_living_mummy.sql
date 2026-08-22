CREATE TABLE `portal_live_messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` text NOT NULL,
	`sender_key` text NOT NULL,
	`sender_name` text NOT NULL,
	`sender_role` text DEFAULT 'visitor' NOT NULL,
	`message` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `portal_live_messages_session_idx` ON `portal_live_messages` (`session_id`,`id`);--> statement-breakpoint
CREATE TABLE `portal_live_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`user_id` integer NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'live' NOT NULL,
	`started_at` text NOT NULL,
	`ended_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `portal_live_sessions_status_idx` ON `portal_live_sessions` (`status`,`started_at`);--> statement-breakpoint
CREATE INDEX `portal_live_sessions_user_idx` ON `portal_live_sessions` (`user_id`,`status`);--> statement-breakpoint
CREATE TABLE `portal_live_signals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` text NOT NULL,
	`sender_key` text NOT NULL,
	`recipient_key` text NOT NULL,
	`kind` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `portal_live_signals_recipient_idx` ON `portal_live_signals` (`session_id`,`recipient_key`,`id`);