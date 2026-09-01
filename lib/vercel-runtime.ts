import { head, put } from "@vercel/blob";
import postgres from "postgres";
import { executeSqlOnFirestore } from "./firestore-sql-bridge";

type BoundValue = string | number | boolean | null | Uint8Array | Date;
type QueryRow = Record<string, unknown>;
type PostgresClient = ReturnType<typeof postgres>;

let postgresClient: PostgresClient | null = null;

const SERIAL_ID_TABLES = new Set([
  "portal_admins",
  "portal_ai_review_logs",
  "portal_import_logs",
  "portal_live_messages",
  "portal_live_signals",
  "portal_support_tickets",
  "portal_users",
]);

function database(): PostgresClient | null {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    return null;
  }
  if (!postgresClient) {
    try {
      postgresClient = postgres(url, {
        max: 5,
        idle_timeout: 20,
        connect_timeout: 10,
        prepare: false,
        ssl: url.includes("localhost") || url.includes("127.0.0.1") ? undefined : "require",
      });
    } catch (err) {
      console.warn("[AI Studio] PostgreSQL initialization fallback:", (err as Error).message);
      return null;
    }
  }
  return postgresClient;
}

function quoteCamelCaseAliases(query: string) {
  return query.replace(/\bAS\s+([A-Za-z_][A-Za-z0-9_]*)/g, (match, alias: string) =>
    /[A-Z]/.test(alias) ? `AS "${alias}"` : match,
  );
}

function numberedParameters(query: string) {
  let index = 0;
  let singleQuoted = false;
  let doubleQuoted = false;
  let output = "";
  for (let position = 0; position < query.length; position += 1) {
    const character = query[position];
    const previous = query[position - 1];
    if (character === "'" && previous !== "\\" && !doubleQuoted) singleQuoted = !singleQuoted;
    if (character === '"' && previous !== "\\" && !singleQuoted) doubleQuoted = !doubleQuoted;
    if (character === "?" && !singleQuoted && !doubleQuoted) {
      index += 1;
      output += `$${index}`;
    } else {
      output += character;
    }
  }
  return output;
}

function transformQuery(source: string, values: BoundValue[]) {
  const pragma = source.trim().match(/^PRAGMA\s+table_info\(([^)]+)\)$/i);
  if (pragma) {
    return {
      query: `SELECT column_name AS "name" FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1 ORDER BY ordinal_position`,
      values: [pragma[1].replace(/["'`]/g, "")] as BoundValue[],
      insertIgnored: false,
    };
  }

  const insertIgnored = /^\s*INSERT\s+OR\s+IGNORE\s+INTO\b/i.test(source);
  let query = source
    .replace(/^\s*INSERT\s+OR\s+IGNORE\s+INTO\b/i, "INSERT INTO")
    .replace(/INTEGER\s+PRIMARY\s+KEY\s+AUTOINCREMENT/gi, "BIGSERIAL PRIMARY KEY")
    .replace(/\bAUTOINCREMENT\b/gi, "");
  query = quoteCamelCaseAliases(query);
  query = numberedParameters(query);
  return { query, values, insertIgnored };
}

function withRunResult(query: string, insertIgnored: boolean) {
  let output = query.trim().replace(/;$/, "");
  if (insertIgnored && !/\bON\s+CONFLICT\b/i.test(output)) output += " ON CONFLICT DO NOTHING";
  const insertTable = output.match(/^INSERT\s+INTO\s+["`]?([a-z0-9_]+)/i)?.[1]?.toLowerCase();
  if (insertTable && SERIAL_ID_TABLES.has(insertTable) && !/\bRETURNING\b/i.test(output)) {
    output += " RETURNING id";
  }
  return output;
}

function d1Result<T extends QueryRow>(rows: T[] & { count?: number | null }): D1Result<T> {
  const returnedId = rows[0]?.id;
  const numericId = typeof returnedId === "number" ? returnedId : Number(returnedId || 0);
  return {
    results: Array.from(rows),
    success: true,
    meta: {
      changes: Number(rows.count ?? rows.length ?? 0),
      last_row_id: Number.isFinite(numericId) ? numericId : 0,
    },
  };
}

class VercelPreparedStatement implements D1PreparedStatement {
  constructor(
    private readonly source: string,
    private readonly values: BoundValue[] = [],
  ) {}

  bind(...values: BoundValue[]) {
    return new VercelPreparedStatement(this.source, values);
  }

  private async execute<T extends QueryRow>(
    mode: "all" | "run",
    client?: any,
  ) {
    try {
      const activeClient = client ?? database();
      if (!activeClient) {
        const firestoreRows = await executeSqlOnFirestore(this.source, this.values);
        return d1Result(firestoreRows as T[]);
      }
      const transformed = transformQuery(this.source, this.values);
      const query = mode === "run"
        ? withRunResult(transformed.query, transformed.insertIgnored)
        : transformed.query;
      const rows = await activeClient.unsafe(query, transformed.values);
      return d1Result(rows as T[]);
    } catch (err) {
      console.warn("[AI Studio] Database execute fallback, trying Firestore:", (err as Error).message);
      try {
        const firestoreRows = await executeSqlOnFirestore(this.source, this.values);
        return d1Result(firestoreRows as T[]);
      } catch {
        return d1Result([] as unknown as T[]);
      }
    }
  }

  async first<T = QueryRow>() {
    const result = await this.execute<QueryRow>("all");
    return (result.results[0] ?? null) as T | null;
  }

  async all<T = QueryRow>() {
    return this.execute<T & QueryRow>("all") as Promise<D1Result<T>>;
  }

  async run<T = QueryRow>() {
    return this.execute<T & QueryRow>("run") as Promise<D1Result<T>>;
  }

  async executeInTransaction(client: any) {
    return this.execute<QueryRow>("run", client);
  }
}

class VercelD1Database implements D1Database {
  prepare(query: string) {
    return new VercelPreparedStatement(query);
  }

  async batch<T = Record<string, unknown>>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
    try {
      const client = database();
      if (!client) {
        return statements.map(() => d1Result([])) as unknown as D1Result<T>[];
      }
      return await client.begin(async (transaction: any) => {
        const results: D1Result<T>[] = [];
        for (const statement of statements) {
          if (!(statement instanceof VercelPreparedStatement)) throw new Error("Invalid database statement.");
          results.push(await statement.executeInTransaction(transaction) as unknown as D1Result<T>);
        }
        return results;
      });
    } catch (err) {
      console.warn("[AI Studio] Database batch fallback:", (err as Error).message);
      return statements.map(() => d1Result([])) as unknown as D1Result<T>[];
    }
  }

  async exec(query: string) {
    try {
      const client = database();
      if (!client) {
        return { count: 0, duration: 0 };
      }
      const startedAt = performance.now();
      const statements = query.split(/;\s*(?:\n|$)/).map((item) => item.trim()).filter(Boolean);
      await client.begin(async (transaction: any) => {
        for (const statement of statements) {
          const transformed = transformQuery(statement, []);
          await transaction.unsafe(transformed.query, transformed.values);
        }
      });
      return { count: statements.length, duration: performance.now() - startedAt };
    } catch (err) {
      console.warn("[AI Studio] Database exec fallback:", (err as Error).message);
      return { count: 0, duration: 0 };
    }
  }
}

function blobBody(value: ArrayBuffer | ArrayBufferView | Blob | ReadableStream | string) {
  if (ArrayBuffer.isView(value)) {
    return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer;
  }
  return value;
}

class VercelBlobBucket implements R2Bucket {
  private inMemoryBlobs = new Map<string, { body: ArrayBuffer; contentType: string; uploadedAt: Date }>();

  async put(
    key: string,
    value: ArrayBuffer | ArrayBufferView | Blob | ReadableStream | string,
    options?: {
      httpMetadata?: { contentType?: string; cacheControl?: string };
      customMetadata?: Record<string, string>;
    },
  ) {
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      try {
        const cacheControl = options?.httpMetadata?.cacheControl || "";
        const maxAge = Number(cacheControl.match(/max-age=(\d+)/i)?.[1] || 31_536_000);
        return await put(key, blobBody(value), {
          access: "public",
          addRandomSuffix: false,
          allowOverwrite: true,
          contentType: options?.httpMetadata?.contentType,
          cacheControlMaxAge: Math.max(60, maxAge),
        });
      } catch (err) {
        console.warn("[AI Studio] Vercel Blob put fallback:", (err as Error).message);
      }
    }
    const buffer = typeof value === "string" ? new TextEncoder().encode(value).buffer :
      value instanceof Blob ? await value.arrayBuffer() :
      ArrayBuffer.isView(value) ? value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) :
      new ArrayBuffer(0);
    this.inMemoryBlobs.set(key, {
      body: buffer as ArrayBuffer,
      contentType: options?.httpMetadata?.contentType || "application/octet-stream",
      uploadedAt: new Date(),
    });
    return { url: `/api/media/${encodeURIComponent(key)}` };
  }

  async get(key: string): Promise<R2ObjectBody | null> {
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      try {
        const metadata = await head(key);
        const response = await fetch(metadata.url, { cache: "force-cache" });
        if (response.ok && response.body) {
          return {
            body: response.body,
            httpEtag: response.headers.get("etag") || `"${metadata.uploadedAt.getTime()}-${metadata.size}"`,
            writeHttpMetadata(headers: Headers) {
              headers.set("content-type", metadata.contentType || "application/octet-stream");
              headers.set("cache-control", metadata.cacheControl || "public, max-age=31536000, immutable");
              headers.set("content-length", String(metadata.size));
            },
          };
        }
      } catch {
        // Fall back to in-memory store
      }
    }
    const item = this.inMemoryBlobs.get(key);
    if (!item) return null;
    return {
      body: new Response(item.body).body as ReadableStream<Uint8Array>,
      httpEtag: `"${item.uploadedAt.getTime()}-${item.body.byteLength}"`,
      writeHttpMetadata(headers: Headers) {
        headers.set("content-type", item.contentType);
        headers.set("cache-control", "public, max-age=31536000, immutable");
        headers.set("content-length", String(item.body.byteLength));
      },
    };
  }
}

export const env = {
  DB: new VercelD1Database(),
  BUCKET: new VercelBlobBucket(),
};
