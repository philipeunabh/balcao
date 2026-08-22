import { NextResponse } from "next/server";
import { getAdminFromRequest } from "../../../../db/admin-auth";
import { listVirtualStoresForAdmin, saveVirtualStoreFromAdmin, type StorePlanCode, virtualStorePlans } from "../../../../db/stores";

export async function GET(request: Request) {
  if (!(await getAdminFromRequest(request))) return NextResponse.json({ error: "Não autorizado." },{status:401});
  return NextResponse.json({ stores: await listVirtualStoresForAdmin(), plans: Object.values(virtualStorePlans) },{headers:{"Cache-Control":"no-store"}});
}

export async function POST(request: Request) {
  if (!(await getAdminFromRequest(request))) return NextResponse.json({ error: "Não autorizado." },{status:401});
  const body=await request.json().catch(()=>({})) as Record<string,unknown>;
  const userId=Number(body.userId); const email=String(body.email||"").trim().toLowerCase(); const planCode=String(body.planCode||"store-pro") as StorePlanCode; const adLimit=Number(body.adLimit||virtualStorePlans[planCode]?.adLimit||50);
  const planStartedAt=body.planStartedAt?new Date(String(body.planStartedAt)).toISOString():null; const planEndsAt=body.planEndsAt?new Date(String(body.planEndsAt)).toISOString():null;
  if(!Number.isInteger(userId)) return NextResponse.json({error:"Selecione um anunciante."},{status:400});
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({error:"Informe o e-mail de acesso."},{status:400});
  if(!(planCode in virtualStorePlans)) return NextResponse.json({error:"Plano inválido."},{status:400});
  if(!Number.isInteger(adLimit)||adLimit<1||adLimit>1000000) return NextResponse.json({error:"Quantidade de anúncios inválida."},{status:400});
  if(planStartedAt&&planEndsAt&&planEndsAt<=planStartedAt) return NextResponse.json({error:"A data final deve ser posterior à inicial."},{status:400});
  try { const store=await saveVirtualStoreFromAdmin({userId,email,planCode,adLimit,planStartedAt,planEndsAt,active:body.active!==false}); return NextResponse.json({ok:true,store}); }
  catch(error){return NextResponse.json({error:error instanceof Error&&error.message==="USER_NOT_FOUND"?"Anunciante não encontrado.":"Não foi possível habilitar a loja."},{status:400});}
}

export const dynamic="force-dynamic";
