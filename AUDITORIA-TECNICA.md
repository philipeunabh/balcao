# Auditoria técnica e preparação para produção

Data da auditoria: 21 de agosto de 2026.

## 1. Escopo e inventário

A análise foi feita diretamente sobre o código-fonte, configurações, migrations e scripts do projeto. O inventário atual contém:

- 30 páginas no App Router e 10 layouts;
- 69 rotas de API;
- 61 componentes/arquivos TSX em `app`;
- 30 módulos de domínio em `db`;
- 33 tabelas de negócio;
- 22 migrations D1/SQLite existentes;
- aproximadamente 16,5 mil linhas TypeScript/TSX/MJS em `app`, `db`, `lib`, `scripts` e `types`;
- 25 arquivos públicos, incluindo identidade visual, banners e mídia editorial.

As superfícies principais são: home e busca, detalhe e criação de anúncio, categorias, notícias, vídeos, favoritos, cadastro/login, conta do usuário, dashboard administrativo, dashboard comercial, dashboard lojista, lojas virtuais, importador IA, newsletter, chat IA, faturamento/pagamento e transmissão ao vivo.

## 2. O que já funcionava corretamente

### Interface e desempenho

- Layout responsivo e identidade visual centralizados em componentes React e Tailwind.
- Fonte Poppins preservada em toda a experiência.
- Home com seções progressivas, `IntersectionObserver`, cache de consultas e imagens de capa em vez da galeria completa.
- Imagens com carregamento otimizado nas superfícies de maior tráfego.
- Proteção contra o anúncio automático fixo do AdSense após o rodapé.
- Metadados, sitemap, robots e dados estruturados existentes.

### Cadastro, autenticação e segurança

- Sessões administrativas e de clientes armazenadas como hashes, com cookies `HttpOnly` e `SameSite`.
- Senhas derivadas com PBKDF2-SHA256 e salt individual.
- Limitação de tentativas no login administrativo.
- Validação de CPF/CNPJ, e-mail e telefone nos fluxos de cadastro.
- Proteção SSRF no importador: destinos locais, loopback e redes privadas são bloqueados.
- Uploads com limite de tamanho e validação de MIME.

### Funcionalidades de negócio

- Classificados com níveis grátis, destaque e super destaque.
- Lojas virtuais, anúncios de loja, renovação, links de compra e importação.
- Faturas, nova tentativa de pagamento, Pix/cartão e webhook PagBank.
- Atendimento IA persistente, busca no catálogo e histórico administrativo.
- Importação por IA, revisão por IA e filas de processamento.
- SMTP, assinantes, campanhas e newsletter de boas-vindas.
- Google Maps/geocodificação, notícias/WordPress e entrega de códigos de verificação.
- Live com sessão, sinais WebRTC e chat persistidos.
- Analytics próprios para sessões, páginas e contatos.

## 3. Problemas encontrados na versão de entrada

| Área | Achado | Risco | Tratamento aplicado |
|---|---|---:|---|
| Build | TypeScript tinha erros de runtime Cloudflare e erros reais de tipos | Alto | Tipos do runtime adicionados e erros corrigidos; `tsc` passa |
| Qualidade | ESLint falhava em efeitos React, `any` e variáveis | Médio | Erros corrigidos sem alteração visual |
| Banco | Aplicação acoplada a D1/SQLite | Alto para Vercel | Adaptador PostgreSQL e schema completo adicionados |
| Upload | Mídia acoplada a R2 | Alto para Vercel | Adaptador compatível sobre Vercel Blob |
| SMTP | Uso direto de sockets Cloudflare | Alto para Vercel | Implementação NodeMailer para Next, mantendo a original |
| Segurança | Hashes e contas administrativas/comerciais fixos no código | Crítico | Removidos; bootstrap somente por variáveis seguras e banco vazio |
| Dados | Lojas, usuários e anúncios demonstrativos eram semeados automaticamente | Alto | Semeadura removida e consultas públicas excluem `is_demo=1` |
| Live | Salas-modelo podiam aparecer como transmissões reais | Alto | Listagem e detalhe agora aceitam somente sessões reais ativas |
| SEO | URL antiga da hospedagem estava codificada em vários módulos | Médio | URL canônica centralizada e configurável |
| Banco | DDL era executado defensivamente em runtime | Médio | Migration PostgreSQL versionada e transacional criada |
| Configuração | Não existia `.env.example` | Médio | Arquivo seguro e documentação adicionados |
| Deploy | Não existia configuração Vercel nativa | Alto | `vercel.json`, scripts e build Next oficial adicionados |

## 4. Arquitetura preparada para a Vercel

```text
Navegador
  -> Next.js App Router (páginas, Server Components e APIs)
      -> módulos de domínio existentes em db/
          -> adaptador D1 compatível
              -> PostgreSQL
      -> adaptador R2 compatível
          -> Vercel Blob
      -> SMTP Node.js
          -> provedor configurado no dashboard
      -> APIs externas configuradas no dashboard
          -> OpenAI/ChatGPT, PagBank, Maps, notícias e verificação
```

O objetivo do adaptador é preservar as 69 APIs e as telas já existentes, reduzindo o risco de uma reescrita total. Queries parametrizadas, aliases SQLite/PostgreSQL e resultados no formato D1 são tratados em uma única camada. O schema PostgreSQL representa as mesmas 33 tabelas e mantém inteiros `0/1` onde o domínio atual espera esse comportamento.

## 5. Banco e dados

O banco abrange configurações, administradores, clientes, verificações, sessões, anúncios, pagamentos, faturas, live/chat, lojas, suporte, analytics, atendimento IA, revisão/importação IA e newsletter.

Foram adicionados:

- `db/schema-postgres.ts`: schema PostgreSQL completo;
- `drizzle-postgres/0000_initial.sql`: migration inicial com tabelas e índices;
- `scripts/migrate-postgres.mjs`: executor transacional com checksum;
- `scripts/import-postgres-json.mjs`: importador idempotente e restrito às tabelas conhecidas.

Nenhum dado fictício foi criado. O repositório não contém a exportação do banco de produção; portanto, os dados reais devem ser exportados do D1 autorizado e importados no PostgreSQL durante a homologação. Sem credenciais e sem essa exportação, não é correto afirmar que a migração de conteúdo já foi executada.

## 6. Autenticação e autorização

Os três acessos existentes foram preservados: administrador/comercial, cliente e lojista. O lojista continua sendo derivado do cliente com loja habilitada. As contas existentes no banco não são alteradas.

Mudança crítica: o repositório não contém mais credenciais administrativas utilizáveis. O bootstrap opcional só ocorre quando `portal_admins` está vazio, exige senha com no mínimo 12 caracteres e lê o valor do ambiente. Depois da primeira criação, as credenciais devem ser removidas ou rotacionadas no provedor.

Antes da virada de produção, execute testes de autorização por perfil para cada API de escrita, além de login, logout, expiração e revogação de sessão.

## 7. Uploads e mídia

As rotas existentes de anúncio, perfil, loja e upload continuam usando a interface de bucket já adotada pelo projeto. Na Vercel, ela é atendida pelo Blob Store. As chaves continuam determinísticas e o conteúdo público recebe metadados de cache.

Pré-requisitos de produção:

- vínculo do Blob Store ao projeto correto;
- token diferente entre Preview e Production;
- validação de upload, leitura e cache em homologação;
- política de backup/retenção alinhada ao banco.

## 8. Integrações externas

As configurações funcionais permanecem no dashboard e no banco, preservando o comportamento atual. A entrada em produção exige testes reais e credenciais próprias para:

- OpenAI/ChatGPT: chat, campanhas, importação e revisão;
- PagBank: chave pública, Pix/cartão, webhook e nova tentativa;
- SMTP: autenticação, remetente, SPF, DKIM e DMARC;
- Google Maps: browser key, geocoding e restrição de domínio;
- notícias/WordPress: origem e disponibilidade;
- Cloudflare Images, quando usado em conjunto com Blob;
- WhatsApp/WAPI e serviços de verificação, quando habilitados.

O WebRTC usa sinalização persistida pela aplicação. Para cobertura confiável em redes móveis e NAT restritivo, configure e valide um serviço TURN antes da liberação comercial do recurso ao vivo.

## 9. Variáveis e segredos

Variáveis de infraestrutura ficam na Vercel, separadas por ambiente. Segredos de negócio editáveis continuam no mecanismo administrativo já existente. Nenhuma chave real foi adicionada ao Git.

Controles recomendados para operação:

- acesso mínimo ao projeto e ao banco;
- rotação de credenciais e trilha de auditoria;
- backups automáticos e teste de restauração;
- proteção WAF/rate limit para login, IA, importação, upload e webhooks;
- alertas de erro, latência e custo das integrações.

## 10. Validação executada

- geração do schema PostgreSQL: concluída, 33 tabelas;
- verificação TypeScript: aprovada;
- lint: aprovado após correções;
- build Next.js nativo para Vercel: aprovado, com 54 páginas estáticas geradas e todas as rotas reconhecidas;
- build de compatibilidade Sites/Cloudflare: aprovado, incluindo validação do artefato Worker e do manifesto de hospedagem;
- teste do HTML renderizado: aprovado.

## 11. Checklist de entrada em produção

1. Criar ambientes Preview e Production isolados.
2. Vincular PostgreSQL e Blob em ambos.
3. Aplicar migration em Preview.
4. Exportar o D1 autorizado e importar os dados reais em Preview.
5. Comparar contagem por tabela, anúncios, usuários, lojas, faturas e mídia.
6. Configurar e testar todas as integrações externas.
7. Executar testes funcionais por perfil e os fluxos de pagamento/webhook.
8. Medir Core Web Vitals com dados e mídia reais.
9. Fazer backup final, aplicar migration/importação em Production e validar amostras.
10. Publicar, apontar domínio, monitorar erros e manter plano de rollback.

O código está preparado e validado para o build de produção. A ativação completa depende, necessariamente, do provisionamento dos recursos, dos segredos e da migração autorizada dos dados reais; esses itens não podem ser fabricados ou substituídos por mocks.
