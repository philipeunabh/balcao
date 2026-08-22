export type DiscoverPage = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  content: string;
  image: string;
  active: boolean;
};

export const defaultDiscoverPages: DiscoverPage[] = [
  { id: "buy-sell", slug: "compre-e-venda-online", title: "Compre e venda online", summary: "Encontre oportunidades e anuncie de forma simples.", content: "Encontre produtos, imóveis, veículos e serviços publicados no Portal Balcão. Compare as informações do anúncio, converse com o anunciante e combine os detalhes antes de fechar o negócio.", image: "https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?auto=format&fit=crop&w=1000&q=80", active: true },
  { id: "sell-fast", slug: "venda-mais-rapido", title: "Venda mais rápido", summary: "Melhore a apresentação e alcance mais compradores.", content: "Use fotos nítidas, um título objetivo, uma descrição completa e um preço compatível com o mercado. Responda às mensagens com agilidade e mantenha os dados do anúncio atualizados.", image: "https://images.unsplash.com/photo-1556740749-887f6717d7e4?auto=format&fit=crop&w=1000&q=80", active: true },
  { id: "safe-deal", slug: "negocie-com-seguranca", title: "Negocie com segurança", summary: "Adote cuidados essenciais antes de concluir a negociação.", content: "Confira os dados do produto e do anunciante, prefira locais públicos para encontros e não faça pagamentos antecipados sem verificar o item. Desconfie de valores muito abaixo do mercado.", image: "https://images.unsplash.com/photo-1563013544-824ae1b704d3?auto=format&fit=crop&w=1000&q=80", active: true },
  { id: "buyer-guide", slug: "guia-do-comprador", title: "Guia do comprador", summary: "Compare anúncios e escolha com mais informação.", content: "Analise fotos, descrição, localização, condições de pagamento e histórico de manutenção quando aplicável.", image: "https://images.unsplash.com/photo-1556742111-a301076d9d18?auto=format&fit=crop&w=1000&q=80", active: true },
  { id: "better-ad", slug: "anuncio-que-se-destaca", title: "Anúncio que se destaca", summary: "Apresente seu produto com informações completas.", content: "Organize as características mais importantes, informe eventuais detalhes de uso e publique imagens de vários ângulos.", image: "https://images.unsplash.com/photo-1556742502-ec7c0e9f34b1?auto=format&fit=crop&w=1000&q=80", active: true },
  { id: "avoid-scams", slug: "como-evitar-golpes", title: "Como evitar golpes", summary: "Identifique sinais de risco durante a negociação.", content: "Não compartilhe códigos de confirmação, senhas ou dados bancários. Interrompa a conversa quando houver pressão para pagamento imediato.", image: "https://images.unsplash.com/photo-1563986768609-322da13575f3?auto=format&fit=crop&w=1000&q=80", active: true },
  { id: "pro-plan", slug: "plano-profissional", title: "Plano profissional", summary: "Mais alcance para quem anuncia com frequência.", content: "Conheça os recursos de destaque e organização de anúncios destinados a profissionais e empresas.", image: "https://images.unsplash.com/photo-1556761175-b413da4baf72?auto=format&fit=crop&w=1000&q=80", active: true },
  { id: "property-tips", slug: "dicas-para-imoveis", title: "Dicas para imóveis", summary: "Publique localização, características e diferenciais.", content: "Informe o tipo do imóvel, área, número de quartos, vagas, condições da negociação e os principais diferenciais.", image: "https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&w=1000&q=80", active: true },
  { id: "vehicle-tips", slug: "dicas-para-veiculos", title: "Dicas para veículos", summary: "Inclua os dados que o comprador procura.", content: "Informe marca, modelo, ano, quilometragem, combustível, câmbio, histórico de revisões e situação da documentação.", image: "https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?auto=format&fit=crop&w=1000&q=80", active: true },
  { id: "support", slug: "central-de-ajuda", title: "Central de ajuda", summary: "Consulte orientações para usar o Portal Balcão.", content: "Encontre orientações para publicar, editar, localizar e negociar anúncios dentro do portal.", image: "https://images.unsplash.com/photo-1521791136064-7986c2920216?auto=format&fit=crop&w=1000&q=80", active: true },
];
