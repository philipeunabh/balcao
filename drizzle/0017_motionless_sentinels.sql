CREATE TABLE `portal_ai_chat_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`role` text NOT NULL,
	`body` text NOT NULL,
	`intent` text,
	`metadata_json` text DEFAULT '{}' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `portal_ai_chat_messages_session_idx` ON `portal_ai_chat_messages` (`session_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `portal_ai_chat_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`ip_address` text NOT NULL,
	`user_agent` text DEFAULT '' NOT NULL,
	`customer_user_id` integer,
	`status` text DEFAULT 'active' NOT NULL,
	`consent_at` text NOT NULL,
	`last_message_at` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `portal_ai_chat_sessions_last_message_idx` ON `portal_ai_chat_sessions` (`last_message_at`);--> statement-breakpoint
CREATE INDEX `portal_ai_chat_sessions_customer_idx` ON `portal_ai_chat_sessions` (`customer_user_id`,`last_message_at`);