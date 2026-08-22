import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { AccountShell } from "../../account-shell";
import { getCustomerTickets } from "../../../db/customer-account";
import { CUSTOMER_SESSION_COOKIE, getCustomerBySessionToken } from "../../../db/customer-auth";
import { listUserListings } from "../../../db/listings";
import { listUserPayments } from "../../../db/payments";
import { getOwnerContactAnalytics, getUnreadChatCount } from "../../../db/contact-chat";
import { listUserInvoices } from "../../../db/invoices";
import { getVirtualStoreByUser } from "../../../db/stores";

export const dynamic = "force-dynamic";

const sections = ["anuncios", "importador-ia", "mensagens", "favoritos", "planos", "loja", "ao-vivo", "pagamentos", "faturas", "relatorios", "configuracoes", "avaliacoes", "cupons", "ajuda"] as const;

export default async function CustomerAccountSection({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (!sections.includes(section as (typeof sections)[number])) notFound();
  const cookieStore = await cookies();
  const customer = await getCustomerBySessionToken(cookieStore.get(CUSTOMER_SESSION_COOKIE)?.value);
  if (!customer) redirect("/entrar");
  const [tickets, listings, payments, invoices, contactAnalytics, unreadMessages, store] = await Promise.all([section === "ajuda" ? getCustomerTickets(customer.id) : [], listUserListings(customer.id), listUserPayments(customer.id), listUserInvoices(customer.id), getOwnerContactAnalytics(customer.id), getUnreadChatCount(customer.id), getVirtualStoreByUser(customer.id)]);
  if (section === "ao-vivo" && !store?.active) redirect("/minha-conta/loja");
  return <AccountShell customer={customer} section={section as (typeof sections)[number]} tickets={tickets} listings={listings} payments={payments} invoices={invoices} contactAnalytics={contactAnalytics} unreadMessages={unreadMessages} liveEnabled={Boolean(store?.active)} />;
}
