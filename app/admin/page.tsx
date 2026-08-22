import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_SESSION_COOKIE, getAdminBySessionToken } from "../../db/admin-auth";
import AdminDashboard from "./dashboard-client";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const cookieStore = await cookies();
  const admin = await getAdminBySessionToken(cookieStore.get(ADMIN_SESSION_COOKIE)?.value);
  if (!admin) redirect("/admin/login");
  return <AdminDashboard adminEmail={admin.email} />;
}
