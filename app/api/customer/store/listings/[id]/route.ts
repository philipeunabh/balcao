import { NextResponse } from "next/server";
import { getCustomerBySessionToken, readCustomerCookie } from "../../../../../../db/customer-auth";
import { deleteManualStoreListing, getVirtualStoreByUser } from "../../../../../../db/stores";

export async function DELETE(request:Request,{params}:{params:Promise<{id:string}>}){const customer=await getCustomerBySessionToken(readCustomerCookie(request));if(!customer)return NextResponse.json({error:"Sessão expirada."},{status:401});const store=await getVirtualStoreByUser(customer.id);if(!store)return NextResponse.json({error:"Loja não encontrada."},{status:404});const {id}=await params;await deleteManualStoreListing(store,id);return NextResponse.json({ok:true});}
export const dynamic="force-dynamic";
