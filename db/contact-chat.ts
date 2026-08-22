import { ensureCustomerTables } from "./customer-auth";
import { ensureListingTables } from "./listings";

export type ListingContact = {
  listingId: string;
  ownerUserId: number;
  ownerName: string | null;
  ownerEmail: string | null;
  title: string;
  priceLabel: string;
  whatsapp: string;
};

export type ListingContactAnalytics = {
  listingId: string;
  title: string;
  viewUsers: number;
  viewVisitors: number;
  phoneUsers: number;
  phoneVisitors: number;
  whatsappUsers: number;
  whatsappVisitors: number;
};

export type ChatConversationSummary = {
  id: string;
  listingId: string;
  listingTitle: string;
  otherPartyName: string;
  otherPartyAvatar: string | null;
  lastMessage: string | null;
  lastMessageAt: string;
  unreadCount: number;
};

export type ChatMessage = {
  id: string;
  conversationId: string;
  senderUserId: number;
  senderName: string;
  body: string;
  readAt: string | null;
  createdAt: string;
};

export async function ensureContactChatTables() {
  const { env } = await import("cloudflare:workers");
  await Promise.all([ensureCustomerTables(), ensureListingTables()]);
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS portal_listing_contact_events (
      id TEXT PRIMARY KEY NOT NULL,
      listing_id TEXT NOT NULL,
      owner_user_id INTEGER NOT NULL,
      actor_key TEXT NOT NULL,
      actor_user_id INTEGER,
      event_type TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`),
    env.DB.prepare("CREATE UNIQUE INDEX IF NOT EXISTS portal_listing_contact_actor_idx ON portal_listing_contact_events (listing_id, actor_key, event_type)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS portal_listing_contact_owner_idx ON portal_listing_contact_events (owner_user_id, created_at)"),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS portal_listing_proposals (
      id TEXT PRIMARY KEY NOT NULL,
      listing_id TEXT NOT NULL,
      owner_user_id INTEGER NOT NULL,
      sender_name TEXT NOT NULL,
      sender_email TEXT NOT NULL,
      sender_phone TEXT,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS portal_listing_proposals_owner_idx ON portal_listing_proposals (owner_user_id, created_at)"),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS portal_chat_conversations (
      id TEXT PRIMARY KEY NOT NULL,
      listing_id TEXT NOT NULL,
      listing_title TEXT NOT NULL,
      buyer_user_id INTEGER NOT NULL,
      seller_user_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      last_message_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    env.DB.prepare("CREATE UNIQUE INDEX IF NOT EXISTS portal_chat_conversation_participants_idx ON portal_chat_conversations (listing_id, buyer_user_id, seller_user_id)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS portal_chat_conversation_buyer_idx ON portal_chat_conversations (buyer_user_id, last_message_at)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS portal_chat_conversation_seller_idx ON portal_chat_conversations (seller_user_id, last_message_at)"),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS portal_chat_messages (
      id TEXT PRIMARY KEY NOT NULL,
      conversation_id TEXT NOT NULL,
      sender_user_id INTEGER NOT NULL,
      body TEXT NOT NULL,
      read_at TEXT,
      created_at TEXT NOT NULL
    )`),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS portal_chat_messages_conversation_idx ON portal_chat_messages (conversation_id, created_at)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS portal_chat_messages_unread_idx ON portal_chat_messages (conversation_id, read_at)"),
  ]);
}

export async function getListingContact(listingId: string) {
  const { env } = await import("cloudflare:workers");
  await ensureContactChatTables();
  const row = await env.DB.prepare(`SELECT l.id AS listingId, l.user_id AS ownerUserId, u.name AS ownerName, u.email AS ownerEmail, l.title,
    CASE
      WHEN negotiable = 1 OR (price_cents IS NULL AND monthly_rent_cents IS NULL) THEN 'Valor a combinar'
      WHEN monthly_rent_cents IS NOT NULL THEN printf('R$ %.2f/mês', monthly_rent_cents / 100.0)
      ELSE printf('R$ %.2f', price_cents / 100.0)
    END AS priceLabel,
    l.whatsapp
    FROM portal_listings l LEFT JOIN portal_users u ON u.id = l.user_id
    WHERE l.id = ? AND l.status = 'active' LIMIT 1`)
    .bind(listingId)
    .first<ListingContact>();
  if (!row) return null;
  const amountMatch = row.priceLabel.match(/^R\$ (\d+)\.(\d{2})(\/mês)?$/);
  if (!amountMatch) return row;
  const amount = Number(`${amountMatch[1]}.${amountMatch[2]}`);
  return { ...row, priceLabel: `${amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}${amountMatch[3] || ""}` };
}

export async function recordListingContact(input: {
  listingId: string;
  ownerUserId: number;
  actorKey: string;
  actorUserId: number | null;
  eventType: "detail_view" | "phone_reveal" | "whatsapp_click" | "chat_start" | "proposal_submit";
}) {
  const { env } = await import("cloudflare:workers");
  await ensureContactChatTables();
  const result = await env.DB.prepare(`INSERT OR IGNORE INTO portal_listing_contact_events
    (id, listing_id, owner_user_id, actor_key, actor_user_id, event_type, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .bind(crypto.randomUUID(), input.listingId, input.ownerUserId, input.actorKey, input.actorUserId, input.eventType, new Date().toISOString())
    .run();
  return Number(result.meta.changes || 0) > 0;
}

export async function hasListingContactEvent(listingId: string, actorKey: string, eventType: "detail_view" | "phone_reveal" | "whatsapp_click" | "chat_start" | "proposal_submit") {
  const { env } = await import("cloudflare:workers");
  await ensureContactChatTables();
  return Boolean(await env.DB.prepare("SELECT 1 FROM portal_listing_contact_events WHERE listing_id = ? AND actor_key = ? AND event_type = ? LIMIT 1")
    .bind(listingId, actorKey, eventType).first());
}

export async function saveListingProposal(input: {
  listingId: string;
  ownerUserId: number;
  name: string;
  email: string;
  phone: string;
  message: string;
}) {
  const { env } = await import("cloudflare:workers");
  await ensureContactChatTables();
  await env.DB.prepare(`INSERT INTO portal_listing_proposals
    (id, listing_id, owner_user_id, sender_name, sender_email, sender_phone, message, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(crypto.randomUUID(), input.listingId, input.ownerUserId, input.name, input.email, input.phone || null, input.message, new Date().toISOString())
    .run();
}

export async function getOwnerContactAnalytics(userId: number) {
  const { env } = await import("cloudflare:workers");
  await ensureContactChatTables();
  const result = await env.DB.prepare(`SELECT e.listing_id AS listingId, l.title,
    SUM(CASE WHEN e.event_type = 'detail_view' AND e.actor_user_id IS NOT NULL THEN 1 ELSE 0 END) AS viewUsers,
    SUM(CASE WHEN e.event_type = 'detail_view' AND e.actor_user_id IS NULL THEN 1 ELSE 0 END) AS viewVisitors,
    SUM(CASE WHEN e.event_type = 'phone_reveal' AND e.actor_user_id IS NOT NULL THEN 1 ELSE 0 END) AS phoneUsers,
    SUM(CASE WHEN e.event_type = 'phone_reveal' AND e.actor_user_id IS NULL THEN 1 ELSE 0 END) AS phoneVisitors,
    SUM(CASE WHEN e.event_type = 'whatsapp_click' AND e.actor_user_id IS NOT NULL THEN 1 ELSE 0 END) AS whatsappUsers,
    SUM(CASE WHEN e.event_type = 'whatsapp_click' AND e.actor_user_id IS NULL THEN 1 ELSE 0 END) AS whatsappVisitors
    FROM portal_listing_contact_events e
    JOIN portal_listings l ON l.id = e.listing_id
    WHERE e.owner_user_id = ?
    GROUP BY e.listing_id, l.title
    ORDER BY MAX(e.created_at) DESC`)
    .bind(userId)
    .all<ListingContactAnalytics>();
  return result.results.map((row) => ({
    ...row,
    viewUsers: Number(row.viewUsers || 0),
    viewVisitors: Number(row.viewVisitors || 0),
    phoneUsers: Number(row.phoneUsers || 0),
    phoneVisitors: Number(row.phoneVisitors || 0),
    whatsappUsers: Number(row.whatsappUsers || 0),
    whatsappVisitors: Number(row.whatsappVisitors || 0),
  }));
}

export async function startChatConversation(listingId: string, buyerUserId: number) {
  const contact = await getListingContact(listingId);
  if (!contact) return { error: "Anúncio não encontrado ou indisponível." } as const;
  if (contact.ownerUserId === buyerUserId) return { error: "Você não pode iniciar uma conversa no seu próprio anúncio." } as const;
  const { env } = await import("cloudflare:workers");
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await env.DB.prepare(`INSERT OR IGNORE INTO portal_chat_conversations
    (id, listing_id, listing_title, buyer_user_id, seller_user_id, status, last_message_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?)`)
    .bind(id, contact.listingId, contact.title, buyerUserId, contact.ownerUserId, now, now, now)
    .run();
  const conversation = await env.DB.prepare(`SELECT id FROM portal_chat_conversations
    WHERE listing_id = ? AND buyer_user_id = ? AND seller_user_id = ? LIMIT 1`)
    .bind(contact.listingId, buyerUserId, contact.ownerUserId)
    .first<{ id: string }>();
  return conversation ? { id: conversation.id } as const : { error: "Não foi possível iniciar a conversa." } as const;
}

export async function listChatConversations(userId: number) {
  const { env } = await import("cloudflare:workers");
  await ensureContactChatTables();
  const result = await env.DB.prepare(`SELECT c.id, c.listing_id AS listingId, c.listing_title AS listingTitle,
    CASE WHEN c.buyer_user_id = ? THEN seller.name ELSE buyer.name END AS otherPartyName,
    CASE WHEN c.buyer_user_id = ? THEN seller.profile_image_url ELSE buyer.profile_image_url END AS otherPartyAvatar,
    (SELECT m.body FROM portal_chat_messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS lastMessage,
    c.last_message_at AS lastMessageAt,
    (SELECT COUNT(*) FROM portal_chat_messages m WHERE m.conversation_id = c.id AND m.sender_user_id <> ? AND m.read_at IS NULL) AS unreadCount
    FROM portal_chat_conversations c
    JOIN portal_users buyer ON buyer.id = c.buyer_user_id
    JOIN portal_users seller ON seller.id = c.seller_user_id
    WHERE c.buyer_user_id = ? OR c.seller_user_id = ?
    ORDER BY c.last_message_at DESC`)
    .bind(userId, userId, userId, userId, userId)
    .all<ChatConversationSummary>();
  return result.results.map((row) => ({ ...row, unreadCount: Number(row.unreadCount || 0) }));
}

async function getConversationParticipant(conversationId: string, userId: number) {
  const { env } = await import("cloudflare:workers");
  await ensureContactChatTables();
  return env.DB.prepare(`SELECT id FROM portal_chat_conversations
    WHERE id = ? AND (buyer_user_id = ? OR seller_user_id = ?) AND status = 'active' LIMIT 1`)
    .bind(conversationId, userId, userId).first<{ id: string }>();
}

export async function listChatMessages(conversationId: string, userId: number) {
  const participant = await getConversationParticipant(conversationId, userId);
  if (!participant) return null;
  const { env } = await import("cloudflare:workers");
  const now = new Date().toISOString();
  await env.DB.prepare("UPDATE portal_chat_messages SET read_at = ? WHERE conversation_id = ? AND sender_user_id <> ? AND read_at IS NULL")
    .bind(now, conversationId, userId).run();
  const result = await env.DB.prepare(`SELECT m.id, m.conversation_id AS conversationId, m.sender_user_id AS senderUserId,
    u.name AS senderName, m.body, m.read_at AS readAt, m.created_at AS createdAt
    FROM portal_chat_messages m JOIN portal_users u ON u.id = m.sender_user_id
    WHERE m.conversation_id = ? ORDER BY m.created_at ASC LIMIT 300`)
    .bind(conversationId).all<ChatMessage>();
  return result.results;
}

export async function sendChatMessage(conversationId: string, senderUserId: number, body: string) {
  const participant = await getConversationParticipant(conversationId, senderUserId);
  if (!participant) return null;
  const { env } = await import("cloudflare:workers");
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO portal_chat_messages (id, conversation_id, sender_user_id, body, created_at)
      VALUES (?, ?, ?, ?, ?)`).bind(id, conversationId, senderUserId, body, now),
    env.DB.prepare("UPDATE portal_chat_conversations SET last_message_at = ?, updated_at = ? WHERE id = ?")
      .bind(now, now, conversationId),
  ]);
  return { id, conversationId, senderUserId, body, readAt: null, createdAt: now };
}

export async function getUnreadChatCount(userId: number) {
  const { env } = await import("cloudflare:workers");
  await ensureContactChatTables();
  const row = await env.DB.prepare(`SELECT COUNT(*) AS count FROM portal_chat_messages m
    JOIN portal_chat_conversations c ON c.id = m.conversation_id
    WHERE (c.buyer_user_id = ? OR c.seller_user_id = ?) AND m.sender_user_id <> ? AND m.read_at IS NULL`)
    .bind(userId, userId, userId).first<{ count: number }>();
  return Number(row?.count || 0);
}
