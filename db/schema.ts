import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const portalSettings = sqliteTable("portal_settings", {
  key: text("setting_key").primaryKey(),
  value: text("setting_value").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const portalAdmins = sqliteTable("portal_admins", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull().unique(),
  passwordSalt: text("password_salt").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("admin"),
  status: text("status").notNull().default("active"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const portalAdminSessions = sqliteTable("portal_admin_sessions", {
  tokenHash: text("token_hash").primaryKey(),
  adminId: integer("admin_id").notNull(),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull(),
});

export const portalAdminLoginAttempts = sqliteTable("portal_admin_login_attempts", {
  key: text("key").primaryKey(),
  failures: integer("failures").notNull().default(0),
  lastAttemptAt: text("last_attempt_at").notNull(),
  blockedUntil: text("blocked_until"),
});

export const portalUsers = sqliteTable("portal_users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  accountType: text("account_type").notNull(),
  taxId: text("tax_id").notNull().unique(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  whatsapp: text("whatsapp").notNull(),
  profileImageUrl: text("profile_image_url"),
  isAdmin: integer("is_admin", { mode: "boolean" }).notNull().default(false),
  passwordSalt: text("password_salt").notNull(),
  passwordHash: text("password_hash").notNull(),
  status: text("status").notNull().default("active"),
  planCode: text("plan_code").notNull().default("free-10"),
  planName: text("plan_name").notNull().default("Plano Gratuito"),
  adLimit: integer("ad_limit").notNull().default(10),
  activeAds: integer("active_ads").notNull().default(0),
  verifiedAt: text("verified_at").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const portalRegistrationVerifications = sqliteTable("portal_registration_verifications", {
  id: text("id").primaryKey(),
  accountType: text("account_type").notNull(),
  taxId: text("tax_id").notNull(),
  email: text("email").notNull(),
  name: text("name").notNull(),
  whatsapp: text("whatsapp").notNull(),
  passwordSalt: text("password_salt").notNull(),
  passwordHash: text("password_hash").notNull(),
  codeHash: text("code_hash").notNull(),
  expiresAt: text("expires_at").notNull(),
  attempts: integer("attempts").notNull().default(0),
  createdAt: text("created_at").notNull(),
});

export const portalCustomerSessions = sqliteTable("portal_customer_sessions", {
  tokenHash: text("token_hash").primaryKey(),
  userId: integer("user_id").notNull(),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull(),
});

export const portalListings = sqliteTable("portal_listings", {
  id: text("id").primaryKey(),
  userId: integer("user_id").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  negotiationType: text("negotiation_type").notNull(),
  category: text("category").notNull(),
  subcategory: text("subcategory").notNull(),
  priceCents: integer("price_cents"),
  monthlyRentCents: integer("monthly_rent_cents"),
  iptuCents: integer("iptu_cents"),
  condoCents: integer("condo_cents"),
  negotiable: integer("negotiable", { mode: "boolean" }).notNull().default(false),
  address: text("address").notNull(),
  latitude: text("latitude"),
  longitude: text("longitude"),
  displayName: text("display_name").notNull(),
  whatsapp: text("whatsapp").notNull(),
  attributesJson: text("attributes_json").notNull().default("{}"),
  featuresJson: text("features_json").notNull().default("[]"),
  imagesJson: text("images_json").notNull().default("[]"),
  coverImage: text("cover_image").notNull(),
  publicationType: text("publication_type").notNull().default("free"),
  featuredPlan: text("featured_plan"),
  featuredUntil: text("featured_until"),
  expiresAt: text("expires_at"),
  status: text("status").notNull().default("pending_review"),
  paymentProvider: text("payment_provider"),
  paymentReference: text("payment_reference"),
  paymentMethod: text("payment_method"),
  paymentAmountCents: integer("payment_amount_cents"),
  paymentExpiresAt: text("payment_expires_at"),
  paymentStatus: text("payment_status"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  index("portal_listings_user_id_idx").on(table.userId),
  index("portal_listings_status_idx").on(table.status, table.createdAt),
  uniqueIndex("portal_listings_payment_reference_idx").on(table.paymentReference),
]);

export const portalPayments = sqliteTable("portal_payments", {
  id: text("id").primaryKey(),
  userId: integer("user_id").notNull(),
  listingId: text("listing_id").notNull(),
  provider: text("provider").notNull().default("pagbank"),
  providerReference: text("provider_reference"),
  method: text("method").notNull(),
  amountCents: integer("amount_cents").notNull(),
  status: text("status").notNull().default("pending"),
  providerStatus: text("provider_status"),
  planCode: text("plan_code"),
  planLabel: text("plan_label"),
  description: text("description").notNull(),
  cardBrand: text("card_brand"),
  cardLast4: text("card_last4"),
  paidAt: text("paid_at"),
  expiresAt: text("expires_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  index("portal_payments_user_id_idx").on(table.userId, table.createdAt),
  index("portal_payments_listing_id_idx").on(table.listingId, table.createdAt),
  uniqueIndex("portal_payments_provider_reference_idx").on(table.providerReference),
]);

export const portalInvoices = sqliteTable("portal_invoices", {
  id: text("id").primaryKey(),
  userId: integer("user_id").notNull(),
  listingId: text("listing_id").notNull().unique(),
  invoiceNumber: text("invoice_number").notNull().unique(),
  listingTitle: text("listing_title").notNull(),
  description: text("description").notNull(),
  amountCents: integer("amount_cents").notNull().default(0),
  status: text("status").notNull().default("pending"),
  paymentMethod: text("payment_method"),
  issuedAt: text("issued_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  index("portal_invoices_user_id_idx").on(table.userId, table.issuedAt),
]);

export const portalLiveSessions = sqliteTable("portal_live_sessions", {
  id: text("id").primaryKey(), storeId: text("store_id").notNull(), userId: integer("user_id").notNull(),
  title: text("title").notNull(), description: text("description").notNull().default(""), status: text("status").notNull().default("live"),
  startedAt: text("started_at").notNull(), endedAt: text("ended_at"), createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
}, (table) => [index("portal_live_sessions_status_idx").on(table.status, table.startedAt), index("portal_live_sessions_user_idx").on(table.userId, table.status)]);

export const portalLiveMessages = sqliteTable("portal_live_messages", {
  id: integer("id").primaryKey({ autoIncrement: true }), sessionId: text("session_id").notNull(), senderKey: text("sender_key").notNull(),
  senderName: text("sender_name").notNull(), senderRole: text("sender_role").notNull().default("visitor"), message: text("message").notNull(), createdAt: text("created_at").notNull(),
}, (table) => [index("portal_live_messages_session_idx").on(table.sessionId, table.id)]);

export const portalLiveSignals = sqliteTable("portal_live_signals", {
  id: integer("id").primaryKey({ autoIncrement: true }), sessionId: text("session_id").notNull(), senderKey: text("sender_key").notNull(),
  recipientKey: text("recipient_key").notNull(), kind: text("kind").notNull(), payload: text("payload").notNull(), createdAt: text("created_at").notNull(),
}, (table) => [index("portal_live_signals_recipient_idx").on(table.sessionId, table.recipientKey, table.id)]);

export const portalVirtualStores = sqliteTable("portal_virtual_stores", {
  id: text("id").primaryKey(),
  userId: integer("user_id").notNull().unique(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  type: text("type").notNull().default("general"),
  logoUrl: text("logo_url"),
  bannerUrl: text("banner_url"),
  primaryColor: text("primary_color").notNull().default("#d71920"),
  secondaryColor: text("secondary_color").notNull().default("#17191e"),
  description: text("description").notNull().default(""),
  planCode: text("plan_code").notNull().default("store-free"),
  adLimit: integer("ad_limit").notNull().default(50),
  integrationType: text("integration_type").notNull().default("manual"),
  feedUrl: text("feed_url"),
  partnerName: text("partner_name"),
  websiteUrl: text("website_url"),
  email: text("email").notNull().default(""),
  phone: text("phone").notNull().default(""),
  whatsapp: text("whatsapp").notNull().default(""),
  socialLinksJson: text("social_links_json").notNull().default("{}"),
  address: text("address").notNull().default(""),
  city: text("city").notNull().default(""),
  state: text("state").notNull().default(""),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  isDemo: integer("is_demo", { mode: "boolean" }).notNull().default(false),
  planStartedAt: text("plan_started_at"),
  planEndsAt: text("plan_ends_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [index("portal_virtual_stores_type_idx").on(table.type, table.active, table.name)]);

export const portalStoreListings = sqliteTable("portal_store_listings", {
  id: text("id").primaryKey(),
  storeId: text("store_id").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull(),
  subcategory: text("subcategory").notNull(),
  priceCents: integer("price_cents"),
  address: text("address").notNull(),
  coverImage: text("cover_image").notNull(),
  imagesJson: text("images_json").notNull().default("[]"),
  attributesJson: text("attributes_json").notNull().default("{}"),
  externalUrl: text("external_url"),
  source: text("source").notNull().default("manual"),
  featured: integer("featured", { mode: "boolean" }).notNull().default(false),
  status: text("status").notNull().default("active"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [index("portal_store_listings_store_idx").on(table.storeId, table.status, table.createdAt)]);

export const portalSupportTickets = sqliteTable("portal_support_tickets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull(),
  subject: text("subject").notNull(),
  message: text("message").notNull(),
  status: text("status").notNull().default("open"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const portalStoreRenewalRequests = sqliteTable("portal_store_renewal_requests", {
  id: text("id").primaryKey(),
  storeId: text("store_id").notNull(),
  userId: integer("user_id").notNull(),
  requestedPlanCode: text("requested_plan_code").notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [index("portal_store_renewal_requests_store_idx").on(table.storeId, table.createdAt)]);

export const portalListingContactEvents = sqliteTable("portal_listing_contact_events", {
  id: text("id").primaryKey(),
  listingId: text("listing_id").notNull(),
  ownerUserId: integer("owner_user_id").notNull(),
  actorKey: text("actor_key").notNull(),
  actorUserId: integer("actor_user_id"),
  eventType: text("event_type").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [
  uniqueIndex("portal_listing_contact_actor_idx").on(table.listingId, table.actorKey, table.eventType),
  index("portal_listing_contact_owner_idx").on(table.ownerUserId, table.createdAt),
]);

export const portalAnalyticsSessions = sqliteTable("portal_analytics_sessions", {
  id: text("id").primaryKey(),
  firstSeenAt: text("first_seen_at").notNull(),
  lastSeenAt: text("last_seen_at").notNull(),
  landingPath: text("landing_path").notNull(),
  currentPath: text("current_path").notNull(),
  deviceType: text("device_type").notNull(),
  pageviews: integer("pageviews").notNull().default(0),
}, (table) => [
  index("portal_analytics_sessions_last_seen_idx").on(table.lastSeenAt),
]);

export const portalAnalyticsPageviews = sqliteTable("portal_analytics_pageviews", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  path: text("path").notNull(),
  listingId: text("listing_id"),
  occurredAt: text("occurred_at").notNull(),
}, (table) => [
  index("portal_analytics_pageviews_occurred_idx").on(table.occurredAt),
  index("portal_analytics_pageviews_path_idx").on(table.path, table.occurredAt),
  index("portal_analytics_pageviews_listing_idx").on(table.listingId, table.occurredAt),
]);

export const portalChatConversations = sqliteTable("portal_chat_conversations", {
  id: text("id").primaryKey(),
  listingId: text("listing_id").notNull(),
  listingTitle: text("listing_title").notNull(),
  buyerUserId: integer("buyer_user_id").notNull(),
  sellerUserId: integer("seller_user_id").notNull(),
  status: text("status").notNull().default("active"),
  lastMessageAt: text("last_message_at").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  uniqueIndex("portal_chat_conversation_participants_idx").on(table.listingId, table.buyerUserId, table.sellerUserId),
  index("portal_chat_conversation_buyer_idx").on(table.buyerUserId, table.lastMessageAt),
  index("portal_chat_conversation_seller_idx").on(table.sellerUserId, table.lastMessageAt),
]);

export const portalChatMessages = sqliteTable("portal_chat_messages", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id").notNull(),
  senderUserId: integer("sender_user_id").notNull(),
  body: text("body").notNull(),
  readAt: text("read_at"),
  createdAt: text("created_at").notNull(),
}, (table) => [
  index("portal_chat_messages_conversation_idx").on(table.conversationId, table.createdAt),
  index("portal_chat_messages_unread_idx").on(table.conversationId, table.readAt),
]);

export const portalAiChatSessions = sqliteTable("portal_ai_chat_sessions", {
  id: text("id").primaryKey(),
  ipAddress: text("ip_address").notNull(),
  userAgent: text("user_agent").notNull().default(""),
  customerUserId: integer("customer_user_id"),
  status: text("status").notNull().default("active"),
  consentAt: text("consent_at").notNull(),
  lastMessageAt: text("last_message_at").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  index("portal_ai_chat_sessions_last_message_idx").on(table.lastMessageAt),
  index("portal_ai_chat_sessions_customer_idx").on(table.customerUserId, table.lastMessageAt),
]);

export const portalAiChatMessages = sqliteTable("portal_ai_chat_messages", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  role: text("role").notNull(),
  body: text("body").notNull(),
  intent: text("intent"),
  metadataJson: text("metadata_json").notNull().default("{}"),
  createdAt: text("created_at").notNull(),
}, (table) => [index("portal_ai_chat_messages_session_idx").on(table.sessionId, table.createdAt)]);

export const portalAiReviewJobs = sqliteTable("portal_ai_review_jobs", {
  id: text("id").primaryKey(),
  status: text("status").notNull(),
  total: integer("total").notNull().default(0),
  processed: integer("processed").notNull().default(0),
  changed: integer("changed").notNull().default(0),
  failed: integer("failed").notNull().default(0),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const portalAiReviewQueue = sqliteTable("portal_ai_review_queue", {
  jobId: text("job_id").notNull(),
  listingId: text("listing_id").notNull(),
  source: text("source").notNull(),
  position: integer("position").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  currentCategory: text("current_category").notNull(),
  currentSubcategory: text("current_subcategory").notNull(),
  status: text("status").notNull().default("pending"),
}, (table) => [
  uniqueIndex("portal_ai_review_queue_job_listing_idx").on(table.jobId, table.listingId),
  index("portal_ai_review_queue_status_idx").on(table.jobId, table.status, table.position),
]);

export const portalAiReviewLogs = sqliteTable("portal_ai_review_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  jobId: text("job_id").notNull(),
  listingId: text("listing_id").notNull(),
  title: text("title").notNull(),
  oldCategory: text("old_category").notNull(),
  oldSubcategory: text("old_subcategory").notNull(),
  newCategory: text("new_category"),
  newSubcategory: text("new_subcategory"),
  status: text("status").notNull(),
  message: text("message").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [index("portal_ai_review_logs_job_idx").on(table.jobId, table.id)]);

export const portalListingAiOverrides = sqliteTable("portal_listing_ai_overrides", {
  listingId: text("listing_id").primaryKey(),
  category: text("category").notNull(),
  subcategory: text("subcategory").notNull(),
  confidence: integer("confidence").notNull(),
  reason: text("reason").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const portalImportJobs = sqliteTable("portal_import_jobs", {
  id: text("id").primaryKey(),
  sourceUrl: text("source_url").notNull(),
  status: text("status").notNull(),
  total: integer("total").notNull().default(0),
  processed: integer("processed").notNull().default(0),
  imported: integer("imported").notNull().default(0),
  updated: integer("updated").notNull().default(0),
  failed: integer("failed").notNull().default(0),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const portalImportQueue = sqliteTable("portal_import_queue", {
  jobId: text("job_id").notNull(),
  listingId: text("listing_id").notNull(),
  position: integer("position").notNull(),
  payloadJson: text("payload_json").notNull(),
  status: text("status").notNull().default("pending"),
}, (table) => [
  uniqueIndex("portal_import_queue_job_listing_idx").on(table.jobId, table.listingId),
  index("portal_import_queue_status_idx").on(table.jobId, table.status, table.position),
]);

export const portalImportLogs = sqliteTable("portal_import_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  jobId: text("job_id").notNull(),
  listingId: text("listing_id").notNull(),
  title: text("title").notNull(),
  category: text("category"),
  subcategory: text("subcategory"),
  status: text("status").notNull(),
  message: text("message").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [index("portal_import_logs_job_idx").on(table.jobId, table.id)]);

export const portalNewsletterSubscribers = sqliteTable("portal_newsletter_subscribers", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  status: text("status").notNull().default("active"),
  source: text("source").notNull().default("site_popup"),
  unsubscribeToken: text("unsubscribe_token").notNull().unique(),
  consentAt: text("consent_at").notNull(),
  welcomeSentAt: text("welcome_sent_at"),
  unsubscribedAt: text("unsubscribed_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  index("portal_newsletter_subscribers_status_idx").on(table.status, table.createdAt),
]);

export const portalNewsletterCampaigns = sqliteTable("portal_newsletter_campaigns", {
  id: text("id").primaryKey(),
  subject: text("subject").notNull(),
  preheader: text("preheader").notNull().default(""),
  heading: text("heading").notNull().default(""),
  intro: text("intro").notNull().default(""),
  html: text("html").notNull(),
  status: text("status").notNull().default("draft"),
  recipientCount: integer("recipient_count").notNull().default(0),
  sentCount: integer("sent_count").notNull().default(0),
  failedCount: integer("failed_count").notNull().default(0),
  createdAt: text("created_at").notNull(),
  sentAt: text("sent_at"),
}, (table) => [index("portal_newsletter_campaigns_created_idx").on(table.createdAt)]);

export const portalLegalPublications = sqliteTable("portal_legal_publications", {
  id: text("id").primaryKey(),
  source: text("source").notNull().default("manual"),
  sourceId: text("source_id"),
  title: text("title").notNull(),
  body: text("body").notNull().default(""),
  filename: text("filename").notNull(),
  pdfUrl: text("pdf_url").notNull(),
  pdfKey: text("pdf_key"),
  originalPdfUrl: text("original_pdf_url"),
  imagesJson: text("images_json").notNull().default("[]"),
  sourcePostUrl: text("source_post_url"),
  publishedAt: text("published_at").notNull(),
  status: text("status").notNull().default("active"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  uniqueIndex("portal_legal_publications_source_idx").on(table.source, table.sourceId),
  index("portal_legal_publications_published_idx").on(table.status, table.publishedAt),
]);
