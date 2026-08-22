import { type CustomerRecord, ensureCustomerTables } from "./customer-auth";
import { createListing, ensureListingTables, findStoredListingById, type ListingInput } from "./listings";
import { ensurePaymentTables } from "./payments";

export type CommercialListingInput = ListingInput & {
  highlightedAmountCents?: number;
  operatorEmail: string;
};

async function getCustomer(id: number) {
  const { env } = await import("cloudflare:workers");
  await ensureCustomerTables();
  return env.DB.prepare(`SELECT id, account_type AS accountType, tax_id AS taxId, email, name, whatsapp,
    profile_image_url AS profileImageUrl, is_admin AS isAdmin, status, plan_code AS planCode,
    plan_name AS planName, ad_limit AS adLimit, active_ads AS activeAds, created_at AS createdAt
    FROM portal_users WHERE id = ? AND status = 'active' LIMIT 1`)
    .bind(id).first<CustomerRecord>();
}

function highlightDuration(plan: string | null) {
  return plan === "semiannual" ? 180 : plan === "quarterly" ? 90 : 30;
}

async function recordCommercialSale(input: {
  userId: number;
  listingId: string;
  planCode: string;
  amountCents: number;
  operatorEmail: string;
  expiresAt: string;
}) {
  const { env } = await import("cloudflare:workers");
  await ensurePaymentTables();
  const now = new Date().toISOString();
  await env.DB.prepare(`INSERT INTO portal_payments (
    id, user_id, listing_id, provider, provider_reference, method, amount_cents, status,
    provider_status, plan_code, plan_label, description, paid_at, expires_at, created_at, updated_at
  ) VALUES (?, ?, ?, 'commercial', ?, 'COMMERCIAL', ?, 'paid', 'REGISTERED_BY_SALES', ?, ?, ?, ?, ?, ?, ?)`)
    .bind(
      crypto.randomUUID(), input.userId, input.listingId,
      `commercial:${crypto.randomUUID()}`, input.amountCents, input.planCode,
      input.planCode === "semiannual" ? "Destaque semestral" : input.planCode === "quarterly" ? "Destaque trimestral" : "Destaque mensal",
      `Venda registrada pela equipe comercial (${input.operatorEmail})`, now, input.expiresAt, now, now,
    ).run();
}

export async function createListingByCommercial(userId: number, input: CommercialListingInput) {
  const customer = await getCustomer(userId);
  if (!customer) return { error: "Anunciante não localizado." } as const;
  const created = await createListing(customer, input);
  if ("error" in created) return created;
  if (input.publicationType === "featured") {
    const { env } = await import("cloudflare:workers");
    const days = highlightDuration(input.featuredPlan);
    const expiresAt = new Date(Date.now() + days * 86_400_000).toISOString();
    const amountCents = Math.max(0, Math.round(input.highlightedAmountCents || 0));
    await env.DB.prepare(`UPDATE portal_listings SET status='pending_review', payment_provider='commercial',
      payment_method='COMMERCIAL', payment_amount_cents=?, payment_status='paid', featured_until=?, expires_at=?, updated_at=?
      WHERE id=?`).bind(amountCents, expiresAt, expiresAt, new Date().toISOString(), created.id).run();
    await recordCommercialSale({ userId, listingId: created.id, planCode: input.featuredPlan || "monthly", amountCents, operatorEmail: input.operatorEmail, expiresAt });
  }
  return { id: created.id, status: "pending_review" } as const;
}

export async function sellListingHighlight(input: {
  listingId: string;
  planCode: "monthly" | "quarterly" | "semiannual";
  amountCents: number;
  operatorEmail: string;
}) {
  const { env } = await import("cloudflare:workers");
  await ensureListingTables();
  const listing = await findStoredListingById(input.listingId, true);
  if (!listing) return { error: "Anúncio não localizado." } as const;
  const expiresAt = new Date(Date.now() + highlightDuration(input.planCode) * 86_400_000).toISOString();
  await env.DB.prepare(`UPDATE portal_listings SET publication_type='featured', featured_plan=?, featured_until=?,
    expires_at=?, payment_provider='commercial', payment_method='COMMERCIAL', payment_amount_cents=?,
    payment_status='paid', updated_at=? WHERE id=?`)
    .bind(input.planCode, expiresAt, expiresAt, input.amountCents, new Date().toISOString(), input.listingId).run();
  await recordCommercialSale({ userId: listing.userId, listingId: listing.id, planCode: input.planCode, amountCents: input.amountCents, operatorEmail: input.operatorEmail, expiresAt });
  return { id: listing.id, expiresAt } as const;
}
