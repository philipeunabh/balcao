import { NextResponse } from "next/server";
import { getAdminFromRequest } from "../../../../db/admin-auth";
import { getAnalyticsDashboard, type AnalyticsRange } from "../../../../db/analytics";

export async function GET(request: Request) {
  if (!(await getAdminFromRequest(request))) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  const value = new URL(request.url).searchParams.get("range");
  const range: AnalyticsRange = value === "7d" || value === "30d" ? value : "24h";
  return NextResponse.json(await getAnalyticsDashboard(range), { headers: { "Cache-Control": "no-store" } });
}
export const dynamic = "force-dynamic";
