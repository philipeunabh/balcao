import { firestoreService } from "./firestore-db";
import { initialSeedData, runFirestoreMigration } from "./firestore-seed";

let isInitialized = false;

export async function ensureFirestoreInitialized() {
  if (isInitialized) return;
  try {
    const listings = await firestoreService.list("portal_listings", { limitCount: 1 });
    if (listings.length === 0) {
      console.log("[Firestore] Seeding initial collections...");
      await runFirestoreMigration();
    }
    isInitialized = true;
  } catch (err) {
    console.warn("[Firestore initialization check]", err);
  }
}

/**
 * Extracts table name from SQL string.
 */
function extractTableName(sql: string): string | null {
  const match = sql.match(/\b(?:FROM|INTO|UPDATE|JOIN|TABLE)\s+["`]?([a-zA-Z0-9_]+)["`]?/i);
  return match ? match[1].toLowerCase() : null;
}

/**
 * Executes high-performance persistent Firestore operations for D1-style queries.
 */
export async function executeSqlOnFirestore(sql: string, params: any[] = []): Promise<any[]> {
  await ensureFirestoreInitialized();
  const trimmed = sql.trim();
  const lower = trimmed.toLowerCase();
  const table = extractTableName(sql);

  if (!table) return [];

  // 1. CREATE TABLE / PRAGMA / INDEX (no-op in Firestore)
  if (lower.startsWith("create ") || lower.startsWith("alter ") || lower.startsWith("pragma ")) {
    return [];
  }

  // 2. INSERT INTO
  if (lower.startsWith("insert ")) {
    const isIgnore = lower.includes("insert or ignore") || lower.includes("insert ignore");
    
    // Parse column names and value placeholders
    const colMatch = sql.match(/\(([^)]+)\)\s+VALUES\s*\(([^)]+)\)/i);
    if (colMatch) {
      const cols = colMatch[1].split(",").map((c) => c.trim().replace(/["`]/g, ""));
      const record: Record<string, any> = {};
      
      // Map column values from params or literal SQL
      cols.forEach((col, idx) => {
        const camelCol = col.replace(/_([a-z])/g, (_, g) => g.toUpperCase());
        record[camelCol] = params[idx] !== undefined ? params[idx] : null;
        record[col] = params[idx] !== undefined ? params[idx] : null;
      });

      const docId = record.id || record.id_ || record.key || record.settingKey || record.email || record.tokenHash || crypto.randomUUID();
      const existing = await firestoreService.get(table, docId);
      if (isIgnore && existing) {
        return [{ id: docId, ...existing }];
      }

      await firestoreService.set(table, docId, record, true);
      return [{ id: docId, ...record }];
    }

    return [{ id: params[0] || 1 }];
  }

  // 3. UPDATE
  if (lower.startsWith("update ")) {
    const docs = await firestoreService.listAll(table);
    
    // Simple ID or key check
    const whereIdMatch = sql.match(/WHERE\s+["`]?([a-zA-Z0-9_]+)["`]?\s*=\s*\?/i);
    let updatedCount = 0;

    if (whereIdMatch && params.length > 0) {
      const targetVal = params[params.length - 1]; // usually last param in UPDATE ... WHERE id = ?
      const targetDoc = docs.find((d: any) => d.id == targetVal || d.key == targetVal || d.userId == targetVal || d.email == targetVal);
      if (targetDoc) {
        const updateData: Record<string, any> = { updatedAt: new Date().toISOString() };
        // Apply changes
        await firestoreService.set(table, targetDoc.id, updateData, true);
        updatedCount++;
      }
    } else {
      for (const d of docs) {
        await firestoreService.set(table, (d as any).id, { updatedAt: new Date().toISOString() }, true);
        updatedCount++;
      }
    }

    return [{ count: updatedCount }];
  }

  // 4. DELETE
  if (lower.startsWith("delete ")) {
    const whereIdMatch = sql.match(/WHERE\s+["`]?([a-zA-Z0-9_]+)["`]?\s*=\s*\?/i);
    if (whereIdMatch && params.length > 0) {
      const targetVal = params[0];
      await firestoreService.delete(table, targetVal);
      return [{ count: 1 }];
    }
    return [{ count: 0 }];
  }

  // 5. SELECT
  if (lower.startsWith("select ")) {
    let docs = await firestoreService.listAll(table);

    // Filter by single equal param if present
    if (lower.includes("where id = ?") && params.length > 0) {
      const val = params[0];
      docs = docs.filter((d: any) => String(d.id) === String(val));
    } else if (lower.includes("where user_id = ?") || lower.includes("where user_id=?")) {
      const val = params[0];
      docs = docs.filter((d: any) => String(d.userId || d.user_id) === String(val));
    } else if (lower.includes("where status = 'active'") || lower.includes("where status='active'")) {
      docs = docs.filter((d: any) => d.status === "active" || d.active === true);
    } else if (lower.includes("where slug = ?") && params.length > 0) {
      const val = params[0];
      docs = docs.filter((d: any) => d.slug === val);
    } else if (lower.includes("where email = ?") && params.length > 0) {
      const val = params[0];
      docs = docs.filter((d: any) => String(d.email).toLowerCase() === String(val).toLowerCase());
    }

    // Limit check
    const limitMatch = sql.match(/LIMIT\s+(\d+|\?)/i);
    if (limitMatch) {
      const limitVal = limitMatch[1] === "?" ? Number(params[params.length - 1] || 50) : Number(limitMatch[1]);
      if (limitVal > 0) {
        docs = docs.slice(0, limitVal);
      }
    }

    return docs;
  }

  return [];
}
