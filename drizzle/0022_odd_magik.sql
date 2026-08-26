CREATE TABLE `portal_legal_publications` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`source_id` text,
	`title` text NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`filename` text NOT NULL,
	`pdf_url` text NOT NULL,
	`pdf_key` text,
	`original_pdf_url` text,
	`images_json` text DEFAULT '[]' NOT NULL,
	`source_post_url` text,
	`published_at` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `portal_legal_publications_source_idx` ON `portal_legal_publications` (`source`,`source_id`);--> statement-breakpoint
CREATE INDEX `portal_legal_publications_published_idx` ON `portal_legal_publications` (`status`,`published_at`);