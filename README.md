# Portal de Classificados Balcão

Aplicação full stack do Jornal Balcão para classificados, lojas virtuais, conteúdo editorial, atendimento por IA, pagamentos, newsletters e transmissões ao vivo. A interface existente foi preservada. O código pode operar no runtime atual do Sites/Cloudflare e também como aplicação Next.js nativa na Vercel.

## Stack

- Next.js 16 (App Router), React 19 e TypeScript 5
- Tailwind CSS 4
- PostgreSQL para a implantação na Vercel
- Vercel Blob para imagens e arquivos
- Drizzle Kit para geração de schema
- NodeMailer para SMTP no runtime Node.js
- Adaptação D1/R2 mantida para compatibilidade com a implantação atual

## Requisitos

- Node.js `>=22.13.0`
- npm 10 ou superior
- PostgreSQL acessível por TLS
- projeto Vercel Blob vinculado à aplicação

## Desenvolvimento Next/Vercel

```bash
npm ci
cp .env.example .env.local
npm run db:migrate:postgres
npm run dev:vercel
```

O arquivo `.env.example` documenta apenas nomes e valores públicos seguros. Nunca versionar `.env.local` ou credenciais reais.

## Migração dos dados reais

1. Crie o banco PostgreSQL e configure `DATABASE_URL`.
2. Aplique o schema completo:

```bash
npm run db:migrate:postgres
```

3. Exporte o D1 atual para JSON no formato `{ "portal_nome_da_tabela": [...] }` ou `{ "tables": { ... } }`.
4. Importe o arquivo real:

```bash
npm run db:import:postgres -- caminho/exportacao.json
```

O importador aceita somente as 33 tabelas conhecidas, ignora colunas desconhecidas, não sobrescreve registros existentes e reajusta as sequências numéricas. Faça backup antes da migração e valide contagens e amostras no ambiente de homologação.

## Variáveis de ambiente da Vercel

- `DATABASE_URL`: conexão PostgreSQL com TLS.
- `BLOB_READ_WRITE_TOKEN`: token gerado pela integração Vercel Blob.
- `NEXT_PUBLIC_SITE_URL` e `SITE_URL`: URL canônica, sem barra final.
- `BOOTSTRAP_ADMIN_EMAIL` e `BOOTSTRAP_ADMIN_PASSWORD`: opcionais, usados somente se a tabela de administradores estiver vazia.
- `BOOTSTRAP_COMMERCIAL_ACCOUNTS_JSON`: bootstrap opcional de contas comerciais reais.
- `APP_RUNTIME=vercel`: seleciona o runtime Next local; o script de build já define este valor.

As demais integrações — ChatGPT/OpenAI, PagBank, Google Maps, SMTP, WordPress/notícias, Cloudflare Images e verificação — continuam configuráveis pelo dashboard administrativo e são persistidas no banco. Não há segredo real no repositório.

## Validação

```bash
npm run typecheck
npm run lint
npm run build:vercel
```

Para validar a compatibilidade com a hospedagem Sites/Cloudflare existente:

```bash
npm run build
node --test tests/rendered-html.test.mjs
```

## Deploy na Vercel

1. Vincule um banco PostgreSQL e um Blob Store ao projeto na Vercel.
2. Cadastre as variáveis para Preview e Production.
3. Execute a migração e a importação em homologação.
4. Valide login, uploads, pagamento/webhook, envio SMTP, IA e live.
5. Faça o deploy com o `vercel.json` deste repositório; o comando de build é `npm run build:vercel`.
6. Depois do aceite, aponte o domínio e atualize `SITE_URL`/`NEXT_PUBLIC_SITE_URL`.

O deploy não executa migrações automaticamente. Isso evita alterações acidentais de banco durante builds e rollbacks.

## Compatibilidade com a hospedagem atual

Os comandos `npm run dev`, `npm run build` e `npm run start` continuam usando Vinext, D1 e R2. Os comandos com o sufixo `:vercel` usam o Next.js oficial, PostgreSQL e Vercel Blob. A implementação SMTP é selecionada no build, mantendo a API interna e as telas existentes.

Consulte [AUDITORIA-TECNICA.md](./AUDITORIA-TECNICA.md) para o inventário, os achados e o roteiro de entrada em produção.
