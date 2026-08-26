export type LegalPublication = {
  id: string;
  source: "manual" | "wordpress";
  sourceId: string | null;
  title: string;
  body: string;
  filename: string;
  pdfUrl: string;
  pdfKey: string | null;
  originalPdfUrl: string | null;
  images: string[];
  sourcePostUrl: string | null;
  publishedAt: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

type LegalPublicationRow = Omit<LegalPublication, "images"> & { imagesJson: string };

export type ImportedLegalPublication = {
  id: string;
  sourceId: string;
  title: string;
  body: string;
  filename: string;
  originalPdfUrl: string;
  initialImageUrl: string | null;
  sourcePostUrl: string | null;
  publishedAt: string;
};

const selectColumns = `id, source, source_id AS sourceId, title, body, filename,
  pdf_url AS pdfUrl, pdf_key AS pdfKey, original_pdf_url AS originalPdfUrl,
  images_json AS imagesJson, source_post_url AS sourcePostUrl,
  published_at AS publishedAt, status, created_at AS createdAt, updated_at AS updatedAt`;

function parseImages(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string" && item.length > 0) : [];
  } catch {
    return [];
  }
}

function normalizeRow(row: LegalPublicationRow): LegalPublication {
  const { imagesJson, ...publication } = row;
  return { ...publication, source: row.source === "wordpress" ? "wordpress" : "manual", images: parseImages(imagesJson) };
}

export async function listLegalPublications(options: {
  query?: string;
  limit?: number;
  offset?: number;
  includeInactive?: boolean;
} = {}) {
  const { env } = await import("cloudflare:workers");
  const query = (options.query || "").trim().slice(0, 120);
  const limit = Math.min(Math.max(Math.trunc(options.limit || 12), 1), 250);
  const offset = Math.max(Math.trunc(options.offset || 0), 0);
  const statusClause = options.includeInactive ? "1 = 1" : "status = 'active'";
  const searchClause = query ? "AND (lower(title) LIKE lower(?) OR lower(body) LIKE lower(?))" : "";
  const pattern = `%${query}%`;
  const listStatement = env.DB.prepare(`SELECT ${selectColumns} FROM portal_legal_publications
    WHERE ${statusClause} ${searchClause}
    ORDER BY published_at DESC, created_at DESC LIMIT ? OFFSET ?`);
  const countStatement = env.DB.prepare(`SELECT COUNT(*) AS total FROM portal_legal_publications
    WHERE ${statusClause} ${searchClause}`);
  const list = query ? listStatement.bind(pattern, pattern, limit, offset) : listStatement.bind(limit, offset);
  const count = query ? countStatement.bind(pattern, pattern) : countStatement;
  const [rows, totalRow] = await Promise.all([
    list.all<LegalPublicationRow>(),
    count.first<{ total: number | string }>(),
  ]);
  return {
    items: rows.results.map(normalizeRow),
    total: Number(totalRow?.total || 0),
  };
}

export async function getLegalPublication(id: string) {
  const { env } = await import("cloudflare:workers");
  const row = await env.DB.prepare(`SELECT ${selectColumns} FROM portal_legal_publications WHERE id = ? LIMIT 1`)
    .bind(id).first<LegalPublicationRow>();
  return row ? normalizeRow(row) : null;
}

export async function createManualLegalPublication(input: {
  title: string;
  body: string;
  filename: string;
  pdfUrl: string;
  pdfKey: string;
  publishedAt?: string;
}) {
  const { env } = await import("cloudflare:workers");
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const publishedAt = input.publishedAt || now;
  await env.DB.prepare(`INSERT INTO portal_legal_publications (
    id, source, source_id, title, body, filename, pdf_url, pdf_key, original_pdf_url,
    images_json, source_post_url, published_at, status, created_at, updated_at
  ) VALUES (?, 'manual', NULL, ?, ?, ?, ?, ?, NULL, '[]', NULL, ?, 'active', ?, ?)`)
    .bind(id, input.title, input.body, input.filename, input.pdfUrl, input.pdfKey, publishedAt, now, now).run();
  return getLegalPublication(id);
}

export async function upsertWordpressLegalPublications(items: ImportedLegalPublication[]) {
  const { env } = await import("cloudflare:workers");
  const existingRows = (await env.DB.prepare(
    "SELECT id, original_pdf_url AS originalPdfUrl FROM portal_legal_publications WHERE source = 'wordpress'",
  ).all<{ id: string; originalPdfUrl: string | null }>()).results;
  const existing = new Map(existingRows.map((row) => [row.id, row.originalPdfUrl]));
  const now = new Date().toISOString();
  let imported = 0;
  let updated = 0;
  const statements = items.map((item) => {
    const previousPdf = existing.get(item.id);
    const initialImages = "[]";
    if (previousPdf === undefined) {
      imported += 1;
      return env.DB.prepare(`INSERT INTO portal_legal_publications (
        id, source, source_id, title, body, filename, pdf_url, pdf_key, original_pdf_url,
        images_json, source_post_url, published_at, status, created_at, updated_at
      ) VALUES (?, 'wordpress', ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, 'active', ?, ?)`)
        .bind(item.id, item.sourceId, item.title, item.body, item.filename, item.originalPdfUrl,
          item.originalPdfUrl, initialImages, item.sourcePostUrl, item.publishedAt, now, now);
    }
    updated += 1;
    if (previousPdf !== item.originalPdfUrl) {
      return env.DB.prepare(`UPDATE portal_legal_publications SET source_id = ?, title = ?, body = ?, filename = ?,
        pdf_url = ?, pdf_key = NULL, original_pdf_url = ?, images_json = ?, source_post_url = ?,
        published_at = ?, status = 'active', updated_at = ? WHERE id = ?`)
        .bind(item.sourceId, item.title, item.body, item.filename, item.originalPdfUrl, item.originalPdfUrl,
          initialImages, item.sourcePostUrl, item.publishedAt, now, item.id);
    }
    return env.DB.prepare(`UPDATE portal_legal_publications SET source_id = ?, title = ?, body = ?, filename = ?,
      original_pdf_url = ?, source_post_url = ?, published_at = ?, status = 'active', updated_at = ? WHERE id = ?`)
      .bind(item.sourceId, item.title, item.body, item.filename, item.originalPdfUrl,
        item.sourcePostUrl, item.publishedAt, now, item.id);
  });

  for (let index = 0; index < statements.length; index += 40) {
    await env.DB.batch(statements.slice(index, index + 40));
  }
  return { imported, updated };
}

export async function markLegalPublicationArchived(id: string, pdfKey: string, pdfUrl: string) {
  const { env } = await import("cloudflare:workers");
  await env.DB.prepare("UPDATE portal_legal_publications SET pdf_key = ?, pdf_url = ?, updated_at = ? WHERE id = ?")
    .bind(pdfKey, pdfUrl, new Date().toISOString(), id).run();
  return getLegalPublication(id);
}

export async function setLegalPublicationPreview(id: string, pageIndex: number, imageUrl: string) {
  const { env } = await import("cloudflare:workers");
  const row = await env.DB.prepare("SELECT images_json AS imagesJson FROM portal_legal_publications WHERE id = ? LIMIT 1")
    .bind(id).first<{ imagesJson: string }>();
  if (!row) return null;
  const images = parseImages(row.imagesJson);
  images[pageIndex] = imageUrl;
  await env.DB.prepare("UPDATE portal_legal_publications SET images_json = ?, updated_at = ? WHERE id = ?")
    .bind(JSON.stringify(images), new Date().toISOString(), id).run();
  return getLegalPublication(id);
}
