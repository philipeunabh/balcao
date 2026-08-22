import type { Metadata } from "next";
import { listStoreListings, listVirtualStores } from "../../db/stores";
import { StoreDirectory } from "../storefront";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Lojas de Carros | Balcão", description: "Consulte lojas de veículos e seus estoques de carros e utilitários seminovos.", alternates: { canonical: "/lojas-de-carros" } };

export default async function VehicleStoresPage() {
  const stores = await listVirtualStores("vehicle");
  const pairs = await Promise.all(stores.map(async (store) => [store.id, (await listStoreListings(store.id)).length] as const));
  return <StoreDirectory eyebrow="Veículos" title="Lojas de Carros" description="Lojas de veículos ativas e seus anúncios publicados no portal." stores={stores} counts={Object.fromEntries(pairs)} type="vehicle" />;
}
