import { getCustomerBySessionToken, readCustomerCookie } from "../../../../../db/customer-auth";
import { getUserInvoice } from "../../../../../db/invoices";

const encoder = new TextEncoder();

function pdfEscape(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7E]/g, "").replace(/([\\()])/g, "\\$1");
}

function concatBytes(parts: Uint8Array[]) {
  const output = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) { output.set(part, offset); offset += part.length; }
  return output;
}

function jpegDimensions(bytes: Uint8Array) {
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) { offset += 1; continue; }
    const marker = bytes[offset + 1];
    const length = (bytes[offset + 2] << 8) + bytes[offset + 3];
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      return { height: (bytes[offset + 5] << 8) + bytes[offset + 6], width: (bytes[offset + 7] << 8) + bytes[offset + 8] };
    }
    if (!length) break;
    offset += 2 + length;
  }
  return { width: 304, height: 76 };
}

function createInvoicePdf(input: {
  invoiceNumber: string; customerName: string; customerTaxId: string; listingTitle: string;
  description: string; amount: string; issuedAt: string; status: string; paymentMethod: string; logo?: Uint8Array;
}) {
  const hasLogo = Boolean(input.logo?.length);
  const content = [
    "q", "0.93 0.06 0.09 rg", "40 728 515 3 re f", "Q",
    ...(hasLogo ? ["q", "160 0 0 40 40 760 cm", "/Logo Do", "Q"] : ["BT", "/F2 24 Tf", "0.75 0.03 0.06 rg", "40 775 Td", "(BALCAO) Tj", "ET"]),
    "BT", "/F2 24 Tf", "0 0 0 rg", "365 780 Td", "(FATURA) Tj", "0 -24 Td", "/F1 9 Tf", `(${pdfEscape(input.invoiceNumber)}) Tj`, "ET",
    "BT", "/F2 11 Tf", "0.35 0.38 0.42 rg", "40 695 Td", "(DADOS DO CLIENTE) Tj", "ET",
    "BT", "/F1 11 Tf", "0 0 0 rg", "40 670 Td",
    `(Nome: ${pdfEscape(input.customerName)}) Tj`, "0 -20 Td",
    `(CPF/CNPJ: ${pdfEscape(input.customerTaxId)}) Tj`, "0 -20 Td",
    `(Emissao: ${pdfEscape(input.issuedAt)}) Tj`, "ET",
    "BT", "/F2 11 Tf", "0.35 0.38 0.42 rg", "40 585 Td", "(DESCRICAO DA FATURA) Tj", "ET",
    "BT", "/F1 11 Tf", "0 0 0 rg", "40 560 Td",
    `(Anuncio: ${pdfEscape(input.listingTitle).slice(0, 78)}) Tj`, "0 -22 Td",
    `(Plano: ${pdfEscape(input.description)}) Tj`, "0 -22 Td",
    `(Forma de pagamento: ${pdfEscape(input.paymentMethod)}) Tj`, "ET",
    "q", "0.97 0.97 0.98 rg", "40 420 515 72 re f", "Q",
    "BT", "/F1 10 Tf", "0.35 0.38 0.42 rg", "55 468 Td", "(VALOR TOTAL) Tj", "0 -30 Td", "/F2 25 Tf", "0 0 0 rg", `(${pdfEscape(input.amount)}) Tj`, "ET",
    "BT", "/F2 10 Tf", "0.12 0.45 0.24 rg", "415 448 Td", `(${pdfEscape(input.status)}) Tj`, "ET",
    "BT", "/F1 9 Tf", "0.4 0.43 0.47 rg", "40 82 Td", "(Portal Balcao - classificados perto de voce) Tj", "0 -16 Td", "(Documento emitido eletronicamente pela conta do anunciante.) Tj", "ET",
  ].join("\n");
  const contentBytes = encoder.encode(content);
  const objects: Array<string | Uint8Array> = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R /F2 6 0 R >>${hasLogo ? " /XObject << /Logo 7 0 R >>" : ""} >> /Contents 4 0 R >>`,
    concatBytes([encoder.encode(`<< /Length ${contentBytes.length} >>\nstream\n`), contentBytes, encoder.encode("\nendstream")]),
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
  ];
  if (hasLogo && input.logo) {
    const dimensions = jpegDimensions(input.logo);
    objects.push(concatBytes([
      encoder.encode(`<< /Type /XObject /Subtype /Image /Width ${dimensions.width} /Height ${dimensions.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${input.logo.length} >>\nstream\n`),
      input.logo,
      encoder.encode("\nendstream"),
    ]));
  }

  const parts: Uint8Array[] = [encoder.encode("%PDF-1.4\n")];
  const offsets = [0];
  let byteLength = parts[0].length;
  objects.forEach((object, index) => {
    offsets.push(byteLength);
    const part = concatBytes([encoder.encode(`${index + 1} 0 obj\n`), typeof object === "string" ? encoder.encode(object) : object, encoder.encode("\nendobj\n")]);
    parts.push(part); byteLength += part.length;
  });
  const xref = byteLength;
  let trailer = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index <= objects.length; index += 1) trailer += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  trailer += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  parts.push(encoder.encode(trailer));
  return concatBytes(parts);
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const customer = await getCustomerBySessionToken(readCustomerCookie(request));
  if (!customer) return new Response("Sessão expirada", { status: 401 });
  const { id } = await params;
  const invoice = await getUserInvoice(id, customer.id);
  if (!invoice) return new Response("Fatura não encontrada", { status: 404 });
  const logo = await fetch(new URL("/logo-balcao.jpg", request.url), { cf: { cacheTtl: 3600, cacheEverything: true } } as RequestInit)
    .then(async (response) => response.ok ? new Uint8Array(await response.arrayBuffer()) : undefined)
    .catch(() => undefined);
  const amount = (invoice.amountCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const status = invoice.status === "paid" ? invoice.amountCents === 0 ? "QUITADA - GRATUITA" : "PAGA" : invoice.status === "failed" ? "PAGAMENTO FALHOU" : invoice.status === "cancelled" ? "CANCELADA" : "PENDENTE";
  const method = invoice.amountCents === 0 ? "Sem cobranca" : invoice.paymentMethod === "PIX" ? "Pix" : invoice.paymentMethod === "CREDIT_CARD" ? "Cartao de credito" : "A definir";
  const pdf = createInvoicePdf({ invoiceNumber: invoice.invoiceNumber, customerName: customer.name, customerTaxId: customer.taxId, listingTitle: invoice.listingTitle, description: invoice.description, amount, issuedAt: new Date(invoice.issuedAt).toLocaleDateString("pt-BR"), status, paymentMethod: method, logo });
  return new Response(pdf as BodyInit, { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="fatura-balcao-${invoice.invoiceNumber.toLowerCase()}.pdf"`, "Cache-Control": "private, no-store" } });
}
