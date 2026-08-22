import { NextResponse } from "next/server";
import { confirmFeaturedPayment, findListingByPaymentReference, setListingPaymentStatus } from "../../../../../db/listings";
import { isAuthenticPagBankNotification, verifyFeaturedCheckout } from "../../../../../db/pagbank";
import { updatePaymentByReference } from "../../../../../db/payments";
function checkoutId(payload: Record<string, unknown>) {
  const isPaymentId = (value: unknown): value is string => typeof value === "string" && /^(CHEC|ORDE)_/.test(value);
  const direct = [payload.order_id, payload.orderId, payload.checkout_id, payload.checkoutId, payload.id].find(isPaymentId); if (direct) return direct;
  for (const key of ["order", "checkout"]) {
    const nested = payload[key];
    if (nested && typeof nested === "object") { const id = (nested as Record<string, unknown>).id; if (isPaymentId(id)) return id; }
  }
  return "";
}
export async function POST(request: Request) {
  const rawPayload = await request.text();
  if (!(await isAuthenticPagBankNotification(rawPayload, request.headers.get("x-authenticity-token")))) return NextResponse.json({ error: "Notificação não autenticada." }, { status: 401 });
  let payload: Record<string, unknown>;
  try { payload = JSON.parse(rawPayload || "{}") as Record<string, unknown>; }
  catch { return NextResponse.json({ error: "Corpo inválido." }, { status: 400 }); }
  const id = checkoutId(payload); if (!id) return NextResponse.json({ ok: true });
  const listing = await findListingByPaymentReference(id); if (!listing) return NextResponse.json({ ok: true });
  try {
    const verified = await verifyFeaturedCheckout(id);
    if (verified.referenceId !== `listing-${listing.id}` || verified.amountCents !== listing.paymentAmountCents) return NextResponse.json({ error: "Pagamento divergente." }, { status: 409 });
    if (verified.paid) { await confirmFeaturedPayment(id); return new NextResponse(null, { status: 204 }); }
    if (["DECLINED", "CANCELED"].includes(verified.status)) {
      await setListingPaymentStatus(listing.id, "declined");
      await updatePaymentByReference(id, { status: "declined", providerStatus: verified.status });
    }
    return NextResponse.json({ ok: true });
  }
  catch { return NextResponse.json({ error: "Não foi possível validar o pagamento." }, { status: 503 }); }
}
