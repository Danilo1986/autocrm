# NossoCRM

> CRM inteligente com assistente de IA integrado. Self-hosted com Docker, PostgreSQL e MinIO.

---

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Frontend | Next.js 16, React 19, Tailwind CSS 4, Radix UI |
| Backend | Next.js API Routes, Prisma 6 ORM |
| Database | PostgreSQL 16 |
| Auth | NextAuth.js v5 (JWT + Credentials) |
| Realtime | SSE + pg LISTEN/NOTIFY |
| Storage | MinIO (S3-compatible) |
| AI | AI SDK v6 (Google Gemini, OpenAI, Anthropic) |
| Deploy | Docker (standalone) |

---

## Setup

### Pre-requisitos

- Docker e Docker Compose
- Node.js 20+
- MinIO server (ou qualquer S3-compatible)

### 1. Clonar e instalar

```bash
git clone https://github.com/Danilo1986/autocrm.git
cd autocrm
npm install
```

### 2. Configurar ambiente

```bash
cp .env.example .env
```

Edite `.env` com suas configuracoes:

```env
DATABASE_URL=postgresql://nossocrm:nossocrm123@localhost:5432/nossocrm
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=gere-com-openssl-rand-base64-32
MINIO_ENDPOINT=http://seu-minio:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
```

### 3. Subir banco de dados

```bash
docker compose up postgres -d
```

### 4. Criar tabelas e seed

```bash
npx prisma generate
npx prisma db push
npx tsx lib/db/seed.ts
```

### 5. Aplicar triggers de realtime

```bash
docker cp prisma/migrations/20260404000000_add_realtime_notify_triggers/migration.sql \
  autocrm-postgres-1:/tmp/migration.sql
docker exec autocrm-postgres-1 psql -U nossocrm -d nossocrm -f /tmp/migration.sql
```

### 6. Iniciar

```bash
npm run dev
```

Acesse `http://localhost:3000/setup` para criar a organizacao e o primeiro usuario admin.

---

## Docker (producao)

```bash
# Build e subir tudo
docker compose up -d

# Ou build manual
docker build -t nossocrm .
docker run -p 3000:3000 --env-file .env nossocrm
```

---

## Migrar dados do Supabase

Se voce tem uma instancia Supabase existente:

```bash
SUPABASE_URL=https://xxx.supabase.co \
SUPABASE_SERVICE_KEY=eyJ... \
npm run migrate:from-supabase
```

O script exporta auth.users (preservando hashes bcrypt), profiles e todas as tabelas de dados.

---

## Scripts

```bash
npm run dev              # Desenvolvimento
npm run build            # Build producao (standalone)
npm run start            # Servidor producao
npm run lint             # ESLint (zero warnings)
npm run typecheck        # TypeScript check
npm run test:run         # Vitest
npm run db:generate      # Prisma generate
npm run db:push          # Push schema para banco
npm run db:seed          # Seed dados iniciais
npm run db:studio        # Prisma Studio (UI)
npm run migrate:from-supabase  # Migrar dados do Supabase
```

---

## Estrutura

```
autocrm/
├── app/                  # Next.js App Router
│   ├── (protected)/      # Rotas autenticadas
│   ├── api/              # API Routes
│   └── login/            # Login page
├── features/             # Modulos por dominio
├── components/           # Componentes UI compartilhados
├── lib/
│   ├── auth/             # NextAuth config
│   ├── db/               # Prisma client + seed
│   ├── services/         # Services Prisma (15 modulos)
│   ├── storage/          # MinIO S3 client
│   ├── realtime/         # SSE + pg LISTEN/NOTIFY
│   ├── ai/               # AI tools, config, prompts
│   └── utils/            # UUID validation, helpers
├── prisma/               # Schema + migrations
├── docker-compose.yml    # PostgreSQL + app
├── Dockerfile            # Next.js standalone
└── scripts/              # Migration scripts
```

---

## API Publica

Documentacao completa: [docs/public-api.md](./docs/public-api.md)

```bash
# Criar API key (via UI em Configuracoes → Integracoes)
# Usar em requisicoes:
curl -H "X-Api-Key: ncrm_..." http://localhost:3000/api/public/v1/contacts
```

Endpoints: `/api/public/v1/boards`, `/contacts`, `/deals`, `/activities`, `/companies`

---

## Webhooks

Documentacao: [docs/webhooks.md](./docs/webhooks.md)

- **Inbound**: receba leads de Hotmart, n8n, Make
- **Outbound**: notifique quando deals mudam de estagio

---

## Licenca

Privado e proprietario. Todos os direitos reservados.
