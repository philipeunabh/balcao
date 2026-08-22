import type { Metadata } from "next";
import { listStoreListings, listVirtualStores } from "../../db/stores";
import { StoreDirectory } from "../storefront";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Lojas Virtuais | Balcão", description: "Encontre imobiliárias, lojas de veículos e lojas virtuais com catálogos completos no Balcão.", alternates: { canonical: "/lojas" } };

export default async function StoresPage() {
  const stores = await listVirtualStores();
  const pairs = await Promise.all(stores.map(async (store) => [store.id, (await listStoreListings(store.id)).length] as const));
  return <StoreDirectory eyebrow="Diretório profissional" title="Lojas Virtuais" description="Encontre empresas com estoque organizado, página própria e anúncios completos." stores={stores} counts={Object.fromEntries(pairs)} />;
}
