import { NextResponse } from "next/server";
import { getAdminFromRequest, listAdminAccounts, setCustomerAdminAccess } from "../../../../db/admin-auth";
import { createCustomerFromAdmin, isValidCnpj, isValidCpf, listCustomersForAdmin, onlyDigits, updateCustomerFromAdmin } from "../../../../db/customer-auth";

function normalizeInput(value: Record<string, unknown>) {
  const accountType = value.accountType === "empresa" ? "empresa" : "particular";
  const taxId = onlyDigits(String(value.taxId || ""));
  const whatsapp = onlyDigits(String(value.whatsapp || ""));
  const email = String(value.email || "").trim().toLowerCase();
  const name = String(value.name || "").trim();
  const password = String(value.password || "");
  const profileImageUrl = String(value.profileImageUrl || "").trim() || null;
  const isAdmin = value.isAdmin === true;
  if (!name || !email || !email.includes("@")) throw new Error("Informe nome e e-mail válidos.");
  if (accountType === "particular" ? !isValidCpf(taxId) : !isValidCnpj(taxId)) throw new Error(`${accountType === "particular" ? "CPF" : "CNPJ"} inválido.`);
  if (whatsapp.length < 10 || whatsapp.length > 11) throw new Error("Informe um WhatsApp válido com DDD.");
  return { accountType, taxId, whatsapp, email, name, password, profileImageUrl, isAdmin } as const;
}

export async function GET(request: Request) {
  if (!(await getAdminFromRequest(request))) {
    return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  }
  const [admins, customers] = await Promise.all([listAdminAccounts(), listCustomersForAdmin()]);
  const customerEmails = new Set(customers.map((customer) => customer.email.toLowerCase()));
  return NextResponse.json({
    users: [
      ...admins.filter((admin) => !customerEmails.has(admin.email.toLowerCase())).map((admin) => ({
        id: `admin-${admin.id}`,
        name: admin.email === "admin@balcao.com.br"
          ? "Administrador Balcão"
          : admin.email === "philipeuna@gmail.com"
            ? "Philipe Una"
            : admin.email.split("@")[0],
        email: admin.email,
        role: "Administrador",
        status: admin.status === "active" ? "Ativo" : "Pendente",
        systemAdmin: true,
      })),
      ...customers.map((customer) => ({
        id: `customer-${customer.id}`,
        name: customer.name,
        email: customer.email,
        role: customer.isAdmin ? "Administrador" : "Anunciante",
        status: customer.status === "active" ? "Ativo" : "Pendente",
        accountType: customer.accountType,
        planName: customer.planName,
        adLimit: customer.adLimit,
        activeAds: customer.activeAds,
        createdAt: customer.createdAt,
        taxId: customer.taxId,
        whatsapp: customer.whatsapp,
        profileImageUrl: customer.profileImageUrl,
        isAdmin: customer.isAdmin,
      })),
    ],
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (!(await getAdminFromRequest(request))) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  try {
    const input = normalizeInput(await request.json() as Record<string, unknown>);
    if (input.password.length < 8) return NextResponse.json({ error: "A senha deve ter no mínimo 8 caracteres." }, { status: 400 });
    const created = await createCustomerFromAdmin({ ...input, password: input.password });
    await setCustomerAdminAccess({ email: created.email, passwordSalt: created.salt, passwordHash: created.passwordHash, enabled: input.isAdmin });
    return NextResponse.json({ ok: true, id: created.id });
  } catch (error) {
    const message = error instanceof Error && /UNIQUE|constraint/i.test(error.message) ? "CPF/CNPJ ou e-mail já cadastrado." : error instanceof Error ? error.message : "Não foi possível cadastrar o usuário.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PUT(request: Request) {
  if (!(await getAdminFromRequest(request))) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  try {
    const body = await request.json() as Record<string, unknown>;
    const id = Number(body.id);
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Usuário inválido." }, { status: 400 });
    const input = normalizeInput(body);
    if (input.password && input.password.length < 8) return NextResponse.json({ error: "A nova senha deve ter no mínimo 8 caracteres." }, { status: 400 });
    const updated = await updateCustomerFromAdmin(id, input);
    if (!updated) return NextResponse.json({ error: "Usuário não localizado." }, { status: 404 });
    await setCustomerAdminAccess({ oldEmail: updated.oldEmail, email: updated.email, passwordSalt: updated.salt, passwordHash: updated.passwordHash, enabled: input.isAdmin });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error && /UNIQUE|constraint/i.test(error.message) ? "CPF/CNPJ ou e-mail já cadastrado." : error instanceof Error ? error.message : "Não foi possível editar o usuário.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export const dynamic = "force-dynamic";
