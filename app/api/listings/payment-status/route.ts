import { NextResponse } from "next/server";
import { getCustomerBySessionToken, readCustomerCookie } from "../../../../db/customer-auth";
import { confirmFeaturedPayment, findListingForUser, setListingPaymentStatus } from "../../../../db/listings";
import { verifyFeaturedCheckout } from "../../../../db/pagbank";
import { updatePaymentByReference } from "../../../../db/payments";

export async function GET(request: Request) {
  const customer = await getCustomerBySessionToken(readCustomerCookie(request));
  if (!customer) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id")?.trim() || "";
  const listing = id ? await findListingForUser(id, customer.id) : null;
  if (!listing) return NextResponse.json({ error: "Anúncio não encontrado." }, { status: 404 });
  if (listing.paymentStatus === "paid") return NextResponse.json({ paid: true, status: "paid" });
  if (!listing.paymentReference) return NextResponse.json({ paid: false, status: listing.paymentStatus || "pending" });
  try {
    const result = await verifyFeaturedCheckout(listing.paymentReference);
    if (result.referenceId === `listing-${listing.id}` && result.amountCents === listing.paymentAmountCents && result.paid) {
      await confirmFeaturedPayment(listing.paymentReference);
      return NextResponse.json({ paid: true, status: "paid" });
    }
    if (["DECLINED", "CANCELED"].includes(result.status)) {
      await setListingPaymentStatus(listing.id, "declined");
      await updatePaymentByReference(listing.paymentReference, { status: "declined", providerStatus: result.status });
      return NextResponse.json({ paid: false, status: "declined" });
    }
  } catch {
    return NextResponse.json({ paid: false, status: listing.paymentStatus || "pending" });
  }
  return NextResponse.json({ paid: false, status: listing.paymentStatus || "pending" });
}

export const dynamic = "force-dynamic";
