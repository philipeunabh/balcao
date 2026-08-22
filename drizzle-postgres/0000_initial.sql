CREATE TABLE "portal_admin_login_attempts" (
	"key" text PRIMARY KEY NOT NULL,
	"failures" integer DEFAULT 0 NOT NULL,
	"last_attempt_at" text NOT NULL,
	"blocked_until" text
);
--> statement-breakpoint
CREATE TABLE "portal_admin_sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"admin_id" integer NOT NULL,
	"expires_at" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portal_admins" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password_salt" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" text DEFAULT 'admin' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	CONSTRAINT "portal_admins_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "portal_ai_chat_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"role" text NOT NULL,
	"body" text NOT NULL,
	"intent" text,
	"metadata_json" text DEFAULT '{}' NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portal_ai_chat_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"ip_address" text NOT NULL,
	"user_agent" text DEFAULT '' NOT NULL,
	"customer_user_id" integer,
	"status" text DEFAULT 'active' NOT NULL,
	"consent_at" text NOT NULL,
	"last_message_at" text NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portal_ai_review_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"status" text NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	"processed" integer DEFAULT 0 NOT NULL,
	"changed" integer DEFAULT 0 NOT NULL,
	"failed" integer DEFAULT 0 NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portal_ai_review_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"job_id" text NOT NULL,
	"listing_id" text NOT NULL,
	"title" text NOT NULL,
	"old_category" text NOT NULL,
	"old_subcategory" text NOT NULL,
	"new_category" text,
	"new_subcategory" text,
	"status" text NOT NULL,
	"message" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portal_ai_review_queue" (
	"job_id" text NOT NULL,
	"listing_id" text NOT NULL,
	"source" text NOT NULL,
	"position" integer NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"current_category" text NOT NULL,
	"current_subcategory" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portal_analytics_pageviews" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"path" text NOT NULL,
	"listing_id" text,
	"occurred_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portal_analytics_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"first_seen_at" text NOT NULL,
	"last_seen_at" text NOT NULL,
	"landing_path" text NOT NULL,
	"current_path" text NOT NULL,
	"device_type" text NOT NULL,
	"pageviews" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portal_chat_conversations" (
	"id" text PRIMARY KEY NOT NULL,
	"listing_id" text NOT NULL,
	"listing_title" text NOT NULL,
	"buyer_user_id" integer NOT NULL,
	"seller_user_id" integer NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"last_message_at" text NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portal_chat_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"sender_user_id" integer NOT NULL,
	"body" text NOT NULL,
	"read_at" text,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portal_customer_sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"expires_at" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portal_import_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"source_url" text NOT NULL,
	"status" text NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	"processed" integer DEFAULT 0 NOT NULL,
	"imported" integer DEFAULT 0 NOT NULL,
	"updated" integer DEFAULT 0 NOT NULL,
	"failed" integer DEFAULT 0 NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portal_import_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"job_id" text NOT NULL,
	"listing_id" text NOT NULL,
	"title" text NOT NULL,
	"category" text,
	"subcategory" text,
	"status" text NOT NULL,
	"message" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portal_import_queue" (
	"job_id" text NOT NULL,
	"listing_id" text NOT NULL,
	"position" integer NOT NULL,
	"payload_json" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portal_invoices" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"listing_id" text NOT NULL,
	"invoice_number" text NOT NULL,
	"listing_title" text NOT NULL,
	"description" text NOT NULL,
	"amount_cents" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"payment_method" text,
	"issued_at" text NOT NULL,
	"updated_at" text NOT NULL,
	CONSTRAINT "portal_invoices_listing_id_unique" UNIQUE("listing_id"),
	CONSTRAINT "portal_invoices_invoice_number_unique" UNIQUE("invoice_number")
);
--> statement-breakpoint
CREATE TABLE "portal_listing_ai_overrides" (
	"listing_id" text PRIMARY KEY NOT NULL,
	"category" text NOT NULL,
	"subcategory" text NOT NULL,
	"confidence" integer NOT NULL,
	"reason" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portal_listing_contact_events" (
	"id" text PRIMARY KEY NOT NULL,
	"listing_id" text NOT NULL,
	"owner_user_id" integer NOT NULL,
	"actor_key" text NOT NULL,
	"actor_user_id" integer,
	"event_type" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portal_listings" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"negotiation_type" text NOT NULL,
	"category" text NOT NULL,
	"subcategory" text NOT NULL,
	"price_cents" integer,
	"monthly_rent_cents" integer,
	"iptu_cents" integer,
	"condo_cents" integer,
	"negotiable" integer DEFAULT 0 NOT NULL,
	"address" text NOT NULL,
	"latitude" text,
	"longitude" text,
	"display_name" text NOT NULL,
	"whatsapp" text NOT NULL,
	"attributes_json" text DEFAULT '{}' NOT NULL,
	"features_json" text DEFAULT '[]' NOT NULL,
	"images_json" text DEFAULT '[]' NOT NULL,
	"cover_image" text NOT NULL,
	"publication_type" text DEFAULT 'free' NOT NULL,
	"featured_plan" text,
	"featured_until" text,
	"expires_at" text,
	"status" text DEFAULT 'pending_review' NOT NULL,
	"payment_provider" text,
	"payment_reference" text,
	"payment_method" text,
	"payment_amount_cents" integer,
	"payment_expires_at" text,
	"payment_status" text,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portal_live_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"sender_key" text NOT NULL,
	"sender_name" text NOT NULL,
	"sender_role" text DEFAULT 'visitor' NOT NULL,
	"message" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portal_live_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"store_id" text NOT NULL,
	"user_id" integer NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'live' NOT NULL,
	"started_at" text NOT NULL,
	"ended_at" text,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portal_live_signals" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"sender_key" text NOT NULL,
	"recipient_key" text NOT NULL,
	"kind" text NOT NULL,
	"payload" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portal_newsletter_campaigns" (
	"id" text PRIMARY KEY NOT NULL,
	"subject" text NOT NULL,
	"preheader" text DEFAULT '' NOT NULL,
	"heading" text DEFAULT '' NOT NULL,
	"intro" text DEFAULT '' NOT NULL,
	"html" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"recipient_count" integer DEFAULT 0 NOT NULL,
	"sent_count" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"created_at" text NOT NULL,
	"sent_at" text
);
--> statement-breakpoint
CREATE TABLE "portal_newsletter_subscribers" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"source" text DEFAULT 'site_popup' NOT NULL,
	"unsubscribe_token" text NOT NULL,
	"consent_at" text NOT NULL,
	"welcome_sent_at" text,
	"unsubscribed_at" text,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	CONSTRAINT "portal_newsletter_subscribers_email_unique" UNIQUE("email"),
	CONSTRAINT "portal_newsletter_subscribers_unsubscribe_token_unique" UNIQUE("unsubscribe_token")
);
--> statement-breakpoint
CREATE TABLE "portal_payments" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"listing_id" text NOT NULL,
	"provider" text DEFAULT 'pagbank' NOT NULL,
	"provider_reference" text,
	"method" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"provider_status" text,
	"plan_code" text,
	"plan_label" text,
	"description" text NOT NULL,
	"card_brand" text,
	"card_last4" text,
	"paid_at" text,
	"expires_at" text,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portal_registration_verifications" (
	"id" text PRIMARY KEY NOT NULL,
	"account_type" text NOT NULL,
	"tax_id" text NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"whatsapp" text NOT NULL,
	"password_salt" text NOT NULL,
	"password_hash" text NOT NULL,
	"code_hash" text NOT NULL,
	"expires_at" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portal_settings" (
	"setting_key" text PRIMARY KEY NOT NULL,
	"setting_value" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portal_store_listings" (
	"id" text PRIMARY KEY NOT NULL,
	"store_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"category" text NOT NULL,
	"subcategory" text NOT NULL,
	"price_cents" integer,
	"address" text NOT NULL,
	"cover_image" text NOT NULL,
	"images_json" text DEFAULT '[]' NOT NULL,
	"attributes_json" text DEFAULT '{}' NOT NULL,
	"external_url" text,
	"source" text DEFAULT 'manual' NOT NULL,
	"featured" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portal_store_renewal_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"store_id" text NOT NULL,
	"user_id" integer NOT NULL,
	"requested_plan_code" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portal_support_tickets" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"subject" text NOT NULL,
	"message" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portal_users" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_type" text NOT NULL,
	"tax_id" text NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"whatsapp" text NOT NULL,
	"profile_image_url" text,
	"is_admin" integer DEFAULT 0 NOT NULL,
	"password_salt" text NOT NULL,
	"password_hash" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"plan_code" text DEFAULT 'free-10' NOT NULL,
	"plan_name" text DEFAULT 'Plano Gratuito' NOT NULL,
	"ad_limit" integer DEFAULT 10 NOT NULL,
	"active_ads" integer DEFAULT 0 NOT NULL,
	"verified_at" text NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	CONSTRAINT "portal_users_tax_id_unique" UNIQUE("tax_id"),
	CONSTRAINT "portal_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "portal_virtual_stores" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"type" text DEFAULT 'general' NOT NULL,
	"logo_url" text,
	"banner_url" text,
	"primary_color" text DEFAULT '#d71920' NOT NULL,
	"secondary_color" text DEFAULT '#17191e' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"plan_code" text DEFAULT 'store-free' NOT NULL,
	"ad_limit" integer DEFAULT 50 NOT NULL,
	"integration_type" text DEFAULT 'manual' NOT NULL,
	"feed_url" text,
	"partner_name" text,
	"website_url" text,
	"email" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"whatsapp" text DEFAULT '' NOT NULL,
	"social_links_json" text DEFAULT '{}' NOT NULL,
	"address" text DEFAULT '' NOT NULL,
	"city" text DEFAULT '' NOT NULL,
	"state" text DEFAULT '' NOT NULL,
	"active" integer DEFAULT 1 NOT NULL,
	"is_demo" integer DEFAULT 0 NOT NULL,
	"plan_started_at" text,
	"plan_ends_at" text,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	CONSTRAINT "portal_virtual_stores_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "portal_virtual_stores_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE INDEX "portal_ai_chat_messages_session_idx" ON "portal_ai_chat_messages" USING btree ("session_id","created_at");--> statement-breakpoint
CREATE INDEX "portal_ai_chat_sessions_last_message_idx" ON "portal_ai_chat_sessions" USING btree ("last_message_at");--> statement-breakpoint
CREATE INDEX "portal_ai_chat_sessions_customer_idx" ON "portal_ai_chat_sessions" USING btree ("customer_user_id","last_message_at");--> statement-breakpoint
CREATE INDEX "portal_ai_review_logs_job_idx" ON "portal_ai_review_logs" USING btree ("job_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "portal_ai_review_queue_job_listing_idx" ON "portal_ai_review_queue" USING btree ("job_id","listing_id");--> statement-breakpoint
CREATE INDEX "portal_ai_review_queue_status_idx" ON "portal_ai_review_queue" USING btree ("job_id","status","position");--> statement-breakpoint
CREATE INDEX "portal_analytics_pageviews_occurred_idx" ON "portal_analytics_pageviews" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "portal_analytics_pageviews_path_idx" ON "portal_analytics_pageviews" USING btree ("path","occurred_at");--> statement-breakpoint
CREATE INDEX "portal_analytics_pageviews_listing_idx" ON "portal_analytics_pageviews" USING btree ("listing_id","occurred_at");--> statement-breakpoint
CREATE INDEX "portal_analytics_sessions_last_seen_idx" ON "portal_analytics_sessions" USING btree ("last_seen_at");--> statement-breakpoint
CREATE UNIQUE INDEX "portal_chat_conversation_participants_idx" ON "portal_chat_conversations" USING btree ("listing_id","buyer_user_id","seller_user_id");--> statement-breakpoint
CREATE INDEX "portal_chat_conversation_buyer_idx" ON "portal_chat_conversations" USING btree ("buyer_user_id","last_message_at");--> statement-breakpoint
CREATE INDEX "portal_chat_conversation_seller_idx" ON "portal_chat_conversations" USING btree ("seller_user_id","last_message_at");--> statement-breakpoint
CREATE INDEX "portal_chat_messages_conversation_idx" ON "portal_chat_messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "portal_chat_messages_unread_idx" ON "portal_chat_messages" USING btree ("conversation_id","read_at");--> statement-breakpoint
CREATE INDEX "portal_import_logs_job_idx" ON "portal_import_logs" USING btree ("job_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "portal_import_queue_job_listing_idx" ON "portal_import_queue" USING btree ("job_id","listing_id");--> statement-breakpoint
CREATE INDEX "portal_import_queue_status_idx" ON "portal_import_queue" USING btree ("job_id","status","position");--> statement-breakpoint
CREATE INDEX "portal_invoices_user_id_idx" ON "portal_invoices" USING btree ("user_id","issued_at");--> statement-breakpoint
CREATE UNIQUE INDEX "portal_listing_contact_actor_idx" ON "portal_listing_contact_events" USING btree ("listing_id","actor_key","event_type");--> statement-breakpoint
CREATE INDEX "portal_listing_contact_owner_idx" ON "portal_listing_contact_events" USING btree ("owner_user_id","created_at");--> statement-breakpoint
CREATE INDEX "portal_listings_user_id_idx" ON "portal_listings" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "portal_listings_status_idx" ON "portal_listings" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "portal_listings_payment_reference_idx" ON "portal_listings" USING btree ("payment_reference");--> statement-breakpoint
CREATE INDEX "portal_live_messages_session_idx" ON "portal_live_messages" USING btree ("session_id","id");--> statement-breakpoint
CREATE INDEX "portal_live_sessions_status_idx" ON "portal_live_sessions" USING btree ("status","started_at");--> statement-breakpoint
CREATE INDEX "portal_live_sessions_user_idx" ON "portal_live_sessions" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "portal_live_signals_recipient_idx" ON "portal_live_signals" USING btree ("session_id","recipient_key","id");--> statement-breakpoint
CREATE INDEX "portal_newsletter_campaigns_created_idx" ON "portal_newsletter_campaigns" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "portal_newsletter_subscribers_status_idx" ON "portal_newsletter_subscribers" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "portal_payments_user_id_idx" ON "portal_payments" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "portal_payments_listing_id_idx" ON "portal_payments" USING btree ("listing_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "portal_payments_provider_reference_idx" ON "portal_payments" USING btree ("provider_reference");--> statement-breakpoint
CREATE INDEX "portal_store_listings_store_idx" ON "portal_store_listings" USING btree ("store_id","status","created_at");--> statement-breakpoint
CREATE INDEX "portal_store_renewal_requests_store_idx" ON "portal_store_renewal_requests" USING btree ("store_id","created_at");--> statement-breakpoint
CREATE INDEX "portal_virtual_stores_type_idx" ON "portal_virtual_stores" USING btree ("type","active","name");