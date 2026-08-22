import type { Metadata } from "next";
import { listStoreListings, listVirtualStores } from "../../db/stores";
import { StoreDirectory } from "../storefront";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Imobiliárias | Balcão", description: "Consulte imobiliárias e seus anúncios de casas, apartamentos, terrenos e imóveis comerciais.", alternates: { canonical: "/imobiliarias" } };

export default async function RealEstateStoresPage() {
  const stores = await listVirtualStores("real_estate");
  const pairs = await Promise.all(stores.map(async (store) => [store.id, (await listStoreListings(store.id)).length] as const));
  return <StoreDirectory eyebrow="Imóveis" title="Imobiliárias" description="Imobiliárias ativas e seus anúncios publicados no portal." stores={stores} counts={Object.fromEntries(pairs)} type="real_estate" />;
}
