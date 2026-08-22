export type PortalCategory = {
  name: string;
  icon: string;
  subs: string[];
  aliases: string[];
  showInMenu?: boolean;
  order?: number;
};

const hiddenFromTopMenu = new Set([
  "Agro e Indústria",
  "Comércio e Negócios",
  "Máquinas e Equipamentos",
  "Saúde e Bem-estar",
  "Outros",
]);

const categorySeed: PortalCategory[] = [
  { name: "Imóveis", icon: "⌂", aliases: ["imovel", "imóveis", "casa", "apartamento", "terreno"], subs: ["Venda — casas e apartamentos", "Aluguel — casas e apartamentos", "Temporada", "Terrenos, sítios e fazendas", "Comércio e indústria", "Imóvel novo"] },
  { name: "Veículos", icon: "◆", aliases: ["veículo", "veiculos", "autos", "auto", "carro", "moto", "caminhão", "caminhao", "ônibus", "onibus", "van", "utilitário", "utilitario"], subs: ["Carros, vans e utilitários", "Caminhões", "Ônibus", "Motos", "Barcos e aeronaves"] },
  { name: "Autopeças", icon: "⚙", aliases: ["autopeca", "peça automotiva", "pneu"], subs: ["Peças para carros, vans e utilitários", "Peças para caminhões", "Peças para motos", "Peças para barcos e aeronaves", "Peças para ônibus"] },
  { name: "Celulares e Telefonia", icon: "▯", aliases: ["celular", "smartphone", "telefonia", "iphone"], subs: ["Celulares e smartphones", "Acessórios de celular", "Peças de celular", "Smartwatches", "Acessórios para smartwatch", "Telefonia fixa e sem fio"] },
  { name: "Casa, Decoração e Utensílios", icon: "⌂", aliases: ["casa e jardim", "decoração", "moveis", "móveis", "eletrodoméstico"], subs: ["Móveis", "Eletrodomésticos", "Materiais de construção e jardim", "Utilidades domésticas", "Decoração", "Iluminação"] },
  { name: "Eletrônicos, Áudio e Vídeo", icon: "▣", aliases: ["eletrônico", "eletronicos", "áudio", "video", "televisão", "tv"], subs: ["TVs", "Áudio e som", "Câmeras e filmadoras", "Videogames", "Acessórios eletrônicos", "Drones"] },
  { name: "Informática", icon: "▰", aliases: ["informatica", "computador", "notebook", "tablet", "impressora"], subs: ["Computadores e desktops", "Notebooks", "Tablets", "Monitores", "Impressoras", "Peças e acessórios"] },
  { name: "Moda e Beleza", icon: "♢", aliases: ["moda", "beleza", "roupa", "calçado"], subs: ["Roupas femininas", "Roupas masculinas", "Calçados", "Bolsas e acessórios", "Relógios e joias", "Beleza e cuidados pessoais"] },
  { name: "Bebês e Crianças", icon: "♙", aliases: ["bebê", "bebe", "criança", "brinquedo"], subs: ["Roupas infantis", "Calçados infantis", "Brinquedos", "Carrinhos e cadeirinhas", "Móveis infantis", "Artigos para bebês"] },
  { name: "Esportes e Fitness", icon: "◉", aliases: ["esporte", "fitness", "academia", "bicicleta"], subs: ["Bicicletas", "Academia e musculação", "Futebol", "Esportes aquáticos", "Camping", "Outros esportes"] },
  { name: "Lazer e Entretenimento", icon: "♪", aliases: ["lazer", "entretenimento", "livro", "instrumento"], subs: ["Livros e revistas", "Instrumentos musicais", "Filmes e música", "Coleções", "Ingressos", "Hobbies"] },
  { name: "Animais", icon: "♧", aliases: ["animal", "pet", "cachorro", "gato"], subs: ["Cães", "Gatos", "Aves", "Peixes", "Animais de fazenda", "Acessórios e serviços para animais"] },
  { name: "Serviços", icon: "⚒", aliases: ["serviço", "reforma", "tecnologia", "freelancer"], subs: ["Reformas e construção", "Assistência técnica", "Aulas e cursos", "Eventos e festas", "Saúde e beleza", "Serviços profissionais"] },
  { name: "Empregos", icon: "▤", aliases: ["emprego", "vaga", "currículo", "trabalho"], subs: ["Administração", "Comercial e vendas", "Tecnologia", "Saúde", "Serviços gerais", "Estágio e jovem aprendiz"] },
  { name: "Agro e Indústria", icon: "♨", aliases: ["agro", "agricultura", "fazenda", "indústria"], subs: ["Máquinas agrícolas", "Insumos e sementes", "Animais e criação", "Equipamentos industriais", "Produção rural", "Outros"] },
  { name: "Comércio e Negócios", icon: "▥", aliases: ["comércio", "negócio", "empresa", "loja"], subs: ["Pontos comerciais", "Empresas à venda", "Equipamentos comerciais", "Franquias", "Estoque e mercadorias", "Oportunidades de negócio"] },
  { name: "Máquinas e Equipamentos", icon: "⚙", aliases: ["máquina", "equipamento", "ferramenta"], subs: ["Máquinas pesadas", "Ferramentas", "Equipamentos profissionais", "Geradores e motores", "Equipamentos para construção", "Outros"] },
  { name: "Saúde e Bem-estar", icon: "✚", aliases: ["saúde", "bem-estar", "medico", "hospitalar"], subs: ["Equipamentos médicos", "Ortopedia e mobilidade", "Cuidados pessoais", "Suplementos", "Terapias", "Outros"] },
  { name: "Outros", icon: "＋", aliases: ["diversos", "outros", "outro"], subs: ["Doações", "Trocas", "Achados e perdidos", "Materiais diversos", "Oportunidades", "Outros"] },
];

export const portalCategories: PortalCategory[] = categorySeed.map((category, index) => ({
  ...category,
  showInMenu: !hiddenFromTopMenu.has(category.name),
  order: index,
}));

function plain(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function mapCategory(rawCategory: string, title = "") {
  const source = plain(`${rawCategory} ${title}`);
  const exact = portalCategories.find((category) => plain(category.name) === plain(rawCategory));
  if (exact) return exact.name;
  return portalCategories.find((category) => category.aliases.some((alias) => source.includes(plain(alias))))?.name ?? "Outros";
}

export function categoryByName(name: string) {
  return portalCategories.find((category) => plain(category.name) === plain(name) || category.aliases.some((alias) => plain(alias) === plain(name)));
}

export function migrateCategoryName(name: string) {
  return plain(name) === "autos" ? "Veículos" : name;
}
