import { NextResponse } from "next/server";
import { getCustomerBySessionToken, readCustomerCookie } from "../../../../../db/customer-auth";
import { createManualStoreListing, getVirtualStoreByUser, listStoreListings } from "../../../../../db/stores";

function text(value:unknown,max=4000){return String(value||"").trim().slice(0,max)}
function safeUrl(value:unknown){const raw=text(value,1000);if(!raw)return null;try{const url=new URL(raw);return ["http:","https:"].includes(url.protocol)?url.toString():null}catch{return null}}

export async function GET(request:Request){const customer=await getCustomerBySessionToken(readCustomerCookie(request));if(!customer)return NextResponse.json({error:"Sessão expirada."},{status:401});const store=await getVirtualStoreByUser(customer.id);return NextResponse.json({listings:store?await listStoreListings(store.id):[]});}

export async function POST(request:Request){
  const customer=await getCustomerBySessionToken(readCustomerCookie(request));if(!customer)return NextResponse.json({error:"Sessão expirada."},{status:401});const store=await getVirtualStoreByUser(customer.id);if(!store)return NextResponse.json({error:"Sua loja ainda não foi habilitada."},{status:403});
  const body=await request.json().catch(()=>({})) as Record<string,unknown>;const title=text(body.title,180);const description=text(body.description);const category=text(body.category,80);const subcategory=text(body.subcategory,100);const address=text(body.address,240);const externalUrl=safeUrl(body.externalUrl);const images=Array.isArray(body.images)?body.images.map(item=>text(item,1000)).filter(item=>item.startsWith("/api/media/")||/^https:\/\//i.test(item)).slice(0,12):[];const price=body.priceCents==null||body.priceCents===""?null:Number(body.priceCents);
  if(title.length<5||description.length<20||!category||!subcategory)return NextResponse.json({error:"Preencha título, descrição, categoria e subcategoria."},{status:400});if(!images.length)return NextResponse.json({error:"Adicione ao menos uma imagem."},{status:400});if(price!=null&&(!Number.isInteger(price)||price<0))return NextResponse.json({error:"Preço inválido."},{status:400});if(body.externalUrl&&!externalUrl)return NextResponse.json({error:"Link de compra inválido."},{status:400});
  try{const id=await createManualStoreListing(store,{title,description,category,subcategory,priceCents:price,address,coverImage:images[0],images,externalUrl,attributes:{}});return NextResponse.json({ok:true,id,message:"Anúncio da loja publicado."},{status:201});}catch(error){const code=error instanceof Error?error.message:"";return NextResponse.json({error:code==="STORE_INACTIVE"?"O plano da loja está inativo ou expirado.":code==="STORE_LIMIT_REACHED"?"O limite de anúncios do plano foi atingido.":"Não foi possível publicar o anúncio."},{status:409});}
}

export const dynamic="force-dynamic";
