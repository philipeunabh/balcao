import { head, put } from "@vercel/blob";
import postgres from "postgres";

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

function database() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error("DATABASE_URL is required for the Vercel PostgreSQL runtime.");
  }
  if (!postgresClient) {
    postgresClient = postgres(url, {
      max: 5,
      idle_timeout: 20,
      connect_timeout: 10,
      prepare: false,
      ssl: "require",
    });
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

function d1Result<T extends QueryRow>(rows: T[] & { count?: number | null }) : D1Result<T> {
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
    client: PostgresClient = database(),
  ) {
    const transformed = transformQuery(this.source, this.values);
    const query = mode === "run"
      ? withRunResult(transformed.query, transformed.insertIgnored)
      : transformed.query;
    const rows = await client.unsafe<T[]>(query, transformed.values);
    return d1Result(rows);
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

  async executeInTransaction(client: PostgresClient) {
    return this.execute<QueryRow>("run", client);
  }
}

class VercelD1Database implements D1Database {
  prepare(query: string) {
    return new VercelPreparedStatement(query);
  }

  async batch<T = QueryRow>(statements: D1PreparedStatement[]) {
    const client = database();
    return client.begin(async (transaction) => {
      const results: D1Result<T>[] = [];
      for (const statement of statements) {
        if (!(statement instanceof VercelPreparedStatement)) throw new Error("Invalid database statement.");
        results.push(await statement.executeInTransaction(transaction) as D1Result<T>);
      }
      return results;
    });
  }

  async exec(query: string) {
    const startedAt = performance.now();
    const statements = query.split(/;\s*(?:\n|$)/).map((item) => item.trim()).filter(Boolean);
    await database().begin(async (transaction) => {
      for (const statement of statements) {
        const transformed = transformQuery(statement, []);
        await transaction.unsafe(transformed.query, transformed.values);
      }
    });
    return { count: statements.length, duration: performance.now() - startedAt };
  }
}

function blobBody(value: ArrayBuffer | ArrayBufferView | Blob | ReadableStream | string) {
  if (ArrayBuffer.isView(value)) {
    return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer;
  }
  return value;
}

class VercelBlobBucket implements R2Bucket {
  async put(
    key: string,
    value: ArrayBuffer | ArrayBufferView | Blob | ReadableStream | string,
    options?: {
      httpMetadata?: { contentType?: string; cacheControl?: string };
      customMetadata?: Record<string, string>;
    },
  ) {
    const cacheControl = options?.httpMetadata?.cacheControl || "";
    const maxAge = Number(cacheControl.match(/max-age=(\d+)/i)?.[1] || 31_536_000);
    return put(key, blobBody(value), {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: options?.httpMetadata?.contentType,
      cacheControlMaxAge: Math.max(60, maxAge),
    });
  }

  async get(key: string): Promise<R2ObjectBody | null> {
    try {
      const metadata = await head(key);
      const response = await fetch(metadata.url, { cache: "force-cache" });
      if (!response.ok) return null;
      return {
        body: response.body,
        httpEtag: response.headers.get("etag") || `"${metadata.uploadedAt.getTime()}-${metadata.size}"`,
        writeHttpMetadata(headers: Headers) {
          headers.set("content-type", metadata.contentType || "application/octet-stream");
          headers.set("cache-control", metadata.cacheControl || "public, max-age=31536000, immutable");
          headers.set("content-length", String(metadata.size));
        },
      };
    } catch {
      return null;
    }
  }
}

export const env = {
  DB: new VercelD1Database(),
  BUCKET: new VercelBlobBucket(),
};
