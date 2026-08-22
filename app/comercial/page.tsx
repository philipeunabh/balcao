import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_SESSION_COOKIE, getCommercialBySessionToken } from "../../db/admin-auth";
import CommercialDashboard from "./commercial-dashboard";

export const dynamic = "force-dynamic";

export default async function CommercialPage() {
  const cookieStore = await cookies();
  const commercial = await getCommercialBySessionToken(cookieStore.get(ADMIN_SESSION_COOKIE)?.value);
  if (!commercial) redirect("/comercial/login");
  return <CommercialDashboard operatorEmail={commercial.email} />;
}
