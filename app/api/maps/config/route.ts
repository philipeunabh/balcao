import { NextResponse } from "next/server";
import { getMapConfiguration } from "../../../../db/google-maps";

export async function GET() {
  const configuration = await getMapConfiguration();
  return NextResponse.json({ provider: configuration.provider, configured: Boolean(configuration.selectedKey), apiKey: configuration.selectedKey || null }, { headers: { "Cache-Control": "no-store" } });
}
