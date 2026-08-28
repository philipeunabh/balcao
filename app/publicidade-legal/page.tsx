import { permanentRedirect } from "next/navigation";

type LegacySearchParams = {
  q?: string;
  dataInicial?: string;
  dataFinal?: string;
  pagina?: string;
};

export default async function LegacyLegalPublicationsPage({
  searchParams,
}: {
  searchParams: Promise<LegacySearchParams>;
}) {
  const resolved = await searchParams;
  const params = new URLSearchParams();
  if (resolved.q) params.set("q", resolved.q);
  if (resolved.dataInicial) params.set("dataInicial", resolved.dataInicial);
  if (resolved.dataFinal) params.set("dataFinal", resolved.dataFinal);
  if (resolved.pagina) params.set("pagina", resolved.pagina);
  const suffix = params.toString();
  permanentRedirect(`/publicidadelegal${suffix ? `?${suffix}` : ""}`);
}
