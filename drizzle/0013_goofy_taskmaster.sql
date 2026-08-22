CREATE TABLE `portal_chat_conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`listing_id` text NOT NULL,
	`listing_title` text NOT NULL,
	`buyer_user_id` integer NOT NULL,
	`seller_user_id` integer NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`last_message_at` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `portal_chat_conversation_participants_idx` ON `portal_chat_conversations` (`listing_id`,`buyer_user_id`,`seller_user_id`);--> statement-breakpoint
CREATE INDEX `portal_chat_conversation_buyer_idx` ON `portal_chat_conversations` (`buyer_user_id`,`last_message_at`);--> statement-breakpoint
CREATE INDEX `portal_chat_conversation_seller_idx` ON `portal_chat_conversations` (`seller_user_id`,`last_message_at`);--> statement-breakpoint
CREATE TABLE `portal_chat_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`sender_user_id` integer NOT NULL,
	`body` text NOT NULL,
	`read_at` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `portal_chat_messages_conversation_idx` ON `portal_chat_messages` (`conversation_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `portal_chat_messages_unread_idx` ON `portal_chat_messages` (`conversation_id`,`read_at`);--> statement-breakpoint
CREATE TABLE `portal_listing_contact_events` (
	`id` text PRIMARY KEY NOT NULL,
	`listing_id` text NOT NULL,
	`owner_user_id` integer NOT NULL,
	`actor_key` text NOT NULL,
	`actor_user_id` integer,
	`event_type` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `portal_listing_contact_actor_idx` ON `portal_listing_contact_events` (`listing_id`,`actor_key`,`event_type`);--> statement-breakpoint
CREATE INDEX `portal_listing_contact_owner_idx` ON `portal_listing_contact_events` (`owner_user_id`,`created_at`);