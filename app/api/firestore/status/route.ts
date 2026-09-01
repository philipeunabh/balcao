import { NextResponse } from "next/server";
import { runFirestoreMigration } from "@/lib/firestore-seed";
import { firestoreService } from "@/lib/firestore-db";

export async function GET() {
  try {
    const [users, stores, listings, chats] = await Promise.all([
      firestoreService.count("portal_users"),
      firestoreService.count("portal_virtual_stores"),
      firestoreService.count("portal_listings"),
      firestoreService.count("portal_chat_conversations"),
    ]);

    return NextResponse.json({
      status: "online",
      database: "Firestore",
      counts: {
        users,
        stores,
        listings,
        chats,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const force = Boolean(body.force);
    const result = await runFirestoreMigration(force);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
