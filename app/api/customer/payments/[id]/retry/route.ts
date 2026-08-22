import { NextResponse } from "next/server";
import { getCustomerBySessionToken, readCustomerCookie } from "../../../../../../db/customer-auth";
import { findListingForUser, prepareListingHighlight, setListingPaymentReference, setListingPaymentStatus } from "../../../../../../db/listings";
import { createFeaturedCardPayment, createFeaturedPix, getPagBankConfiguration } from "../../../../../../db/pagbank";
import { createPaymentRecord, getUserPayment } from "../../../../../../db/payments";
import { updateInvoiceStatusByListing } from "../../../../../../db/invoices";

type UnknownRecord = Record<string, unknown>;
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const customer = await getCustomerBySessionToken(readCustomerCookie(request));
  if (!customer) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  const { id } = await params;
  const previous = await getUserPayment(id, customer.id);
  if (!previous) return NextResponse.json({ error: "Pagamento não encontrado." }, { status: 404 });
  if (previous.status === "paid") return NextResponse.json({ error: "Este pagamento já foi aprovado." }, { status: 409 });
  const listing = await findListingForUser(previous.listingId, customer.id);
  if (!listing) return NextResponse.json({ error: "O anúncio vinculado ao pagamento não foi encontrado." }, { status: 404 });

  const payload = await request.json().catch(() => ({})) as UnknownRecord;
  const method = payload.method === "card" ? "CREDIT_CARD" : "PIX";
  const configuration = await getPagBankConfiguration();
  if (method === "PIX" && !configuration.pixEnabled) return NextResponse.json({ error: "O pagamento por Pix está desativado." }, { status: 400 });
  if (method === "CREDIT_CARD" && !configuration.cardEnabled) return NextResponse.json({ error: "O pagamento por cartão está desativado." }, { status: 400 });

  const planCode = previous.planCode === "super" ? "super" : "monthly";
  const planLabel = previous.planLabel || previous.description || "Destaque do anúncio";
  await prepareListingHighlight(listing.id, customer.id, planCode, previous.amountCents, method);
  try {
    const origin = new URL(request.url).origin;
    const paymentInput = {
      listingId: listing.id,
      planLabel,
      amountCents: previous.amountCents,
      origin,
      customer: { name: customer.name, email: customer.email, taxId: customer.taxId, whatsapp: customer.whatsapp },
    };
    if (method === "PIX") {
      const pix = await createFeaturedPix(paymentInput);
      await setListingPaymentReference(listing.id, pix.orderId, pix.expiresAt);
      const paymentId = await createPaymentRecord({ userId: customer.id, listingId: listing.id, providerReference: pix.orderId, method: "PIX", amountCents: previous.amountCents, status: "pending", providerStatus: "WAITING", planCode, planLabel, description: planLabel, expiresAt: pix.expiresAt });
      await updateInvoiceStatusByListing(listing.id, "pending", "PIX");
      return NextResponse.json({ ok: true, paymentId, method: "PIX", amountCents: previous.amountCents, qrCodeText: pix.qrCodeText, qrCodeImage: pix.qrCodeImage, expiresAt: pix.expiresAt });
    }

    const card = await createFeaturedCardPayment({
      ...paymentInput,
      encryptedCard: text(payload.encryptedCard) || undefined,
      securityCode: text(payload.securityCode),
      holderName: text(payload.cardHolderName),
      installments: Number(payload.installments || 1),
      saveCard: false,
    });
    await setListingPaymentReference(listing.id, card.orderId);
    await setListingPaymentStatus(listing.id, card.paid ? "paid" : "pending");
    const paymentId = await createPaymentRecord({ userId: customer.id, listingId: listing.id, providerReference: card.orderId, method: "CREDIT_CARD", amountCents: previous.amountCents, status: card.paid ? "paid" : "pending", providerStatus: card.status, planCode, planLabel, description: planLabel, cardBrand: card.cardBrand, cardLast4: card.cardLast4, paidAt: card.paidAt });
    await updateInvoiceStatusByListing(listing.id, card.paid ? "paid" : "pending", "CREDIT_CARD");
    return NextResponse.json({ ok: true, paymentId, method: "CREDIT_CARD", amountCents: previous.amountCents, paid: card.paid, cardBrand: card.cardBrand, cardLast4: card.cardLast4 });
  } catch {
    await setListingPaymentStatus(listing.id, "failed");
    await updateInvoiceStatusByListing(listing.id, "failed", method);
    return NextResponse.json({ error: "O PagBank não conseguiu gerar a nova cobrança. Confira os dados e tente novamente." }, { status: 502 });
  }
}
