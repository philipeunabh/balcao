import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AccountShell } from "../account-shell";
import { CUSTOMER_SESSION_COOKIE, getCustomerBySessionToken } from "../../db/customer-auth";
import { getVirtualStoreByUser } from "../../db/stores";

export default async function RetailerDashboard(){const jar=await cookies();const customer=await getCustomerBySessionToken(jar.get(CUSTOMER_SESSION_COOKIE)?.value);if(!customer)redirect("/entrar?returnTo=/lojista");const store=await getVirtualStoreByUser(customer.id);return <AccountShell customer={customer} section="loja" tickets={[]} listings={[]} payments={[]} invoices={[]} contactAnalytics={[]} unreadMessages={0} liveEnabled={Boolean(store?.active)}/>;}
export const dynamic="force-dynamic";
