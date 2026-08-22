import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { CUSTOMER_SESSION_COOKIE, getCustomerBySessionToken } from "../../db/customer-auth";
import { getCustomerTickets } from "../../db/customer-account";
import { AccountShell } from "../account-shell";
import { listUserListings } from "../../db/listings";
import { listUserPayments } from "../../db/payments";
import { getOwnerContactAnalytics, getUnreadChatCount } from "../../db/contact-chat";
import { listUserInvoices } from "../../db/invoices";
import { getVirtualStoreByUser } from "../../db/stores";

export const dynamic = "force-dynamic";

export default async function UserDashboard() {
  const cookieStore = await cookies();
  const customer = await getCustomerBySessionToken(cookieStore.get(CUSTOMER_SESSION_COOKIE)?.value);
  if (!customer) redirect("/entrar");
  const [tickets, listings, payments, invoices, contactAnalytics, unreadMessages, store] = await Promise.all([getCustomerTickets(customer.id), listUserListings(customer.id), listUserPayments(customer.id), listUserInvoices(customer.id), getOwnerContactAnalytics(customer.id), getUnreadChatCount(customer.id), getVirtualStoreByUser(customer.id)]);
  return <AccountShell customer={customer} section="painel" tickets={tickets} listings={listings} payments={payments} invoices={invoices} contactAnalytics={contactAnalytics} unreadMessages={unreadMessages} liveEnabled={Boolean(store?.active)} />;
}
