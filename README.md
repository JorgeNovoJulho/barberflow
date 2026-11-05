# BarberFlow - Clone GridBarber

Sistema completo de gestão para barbearias - clone exato do GridBarber renomeado para BarberFlow.

## 🚀 Quick Start

### Pré-requisitos
- Node.js 20+
- pnpm 9+ (`npm install -g pnpm`)
- Docker & Docker Compose (opcional, para infraestrutura)

### 1. Subir infraestrutura (PostgreSQL, Redis, MinIO, Mailhog)
```bash
cd docker
docker-compose up -d
```

### 2. Instalar dependências
```bash
cd ..
pnpm install
```

### 3. Configurar variáveis de ambiente
```bash
cp apps/api/.env.example apps/api/.env
# Editar apps/api/.env se necessário
```

### 4. Gerar Prisma Client e criar tabelas
```bash
cd packages/database
pnpm db:generate
pnpm db:push
pnpm db:seed
```

### 5. Rodar em desenvolvimento
```bash
# Terminal 1 - API
cd apps/api
pnpm dev

# Terminal 2 - Web
cd apps/web
pnpm dev
```

- **Frontend**: http://localhost:3000
- **API**: http://localhost:4000
- **Mailhog UI**: http://localhost:8025
- **MinIO Console**: http://localhost:9001 (barberflow / barberflow123)
- **API Health**: http://localhost:4000/health

### Com Docker Compose (tudo junto)
```bash
cd docker
docker-compose up -d
# Acesse http://localhost (nginx proxy)
```

## 🔐 Credenciais Super Admin
- **Email**: jorgericardosalgado@gmail.com
- **Senha**: jorge0609

## 📁 Estrutura do Monorepo

```
BarberFlow/
├── apps/
│   ├── web/              # React + Vite + TailwindCSS
│   │   ├── src/
│   │   │   ├── pages/    # Landing, Auth, Dashboard, Agenda, Professionals, Services, Clients, Reports, Settings, PublicBooking
│   │   │   ├── components/ # Layout, UI components
│   │   │   ├── hooks/    # Custom hooks
│   │   │   ├── stores/   # Zustand stores (auth, theme, agenda)
│   │   │   ├── lib/      # Utils, API client, themes
│   │   │   ├── styles/   # Global CSS
│   │   │   └── types/    # TypeScript types
│   │   └── package.json
│   │
│   └── api/              # Node.js + Express + Prisma
│       ├── src/
│       │   ├── modules/  # Feature modules
│       │   │   ├── auth/
│       │   │   ├── barbershops/
│       │   │   ├── professionals/
│       │   │   ├── services/
│       │   │   ├── appointments/
│       │   │   ├── clients/
│       │   │   ├── subscriptions/
│       │   │   ├── themes/
│       │   │   ├── notifications/
│       │   │   ├── payments/
│       │   │   └── superadmin/
│       │   ├── middleware/
│       │   ├── utils/
│       │   ├── config/
│       │   └── main.ts
│       └── package.json
│
├── packages/
│   ├── shared/           # Tipos, validações, constantes compartilhadas
│   ├── ui/               # Componentes base (Button, Input, Card, Modal, etc)
│   └── database/         # Prisma schema + migrations + seed
│
├── docker/
│   ├── docker-compose.yml
│   ├── Dockerfile.api
│   ├── Dockerfile.web
│   └── nginx/
│
├── docs/
│   ├── api.md
│   ├── themes.md
│   ├── deployment.md
│   └── architecture.md
│
├── turbo.json
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
└── README.md
```

## 🛠️ Scripts Úteis

```bash
# Desenvolvimento
pnpm dev                    # Roda tudo (web + api) via Turborepo
pnpm build                  # Build de produção
pnpm lint                   # Lint em todos os pacotes
pnpm type-check             # Type check em todos os pacotes

# Database
cd packages/database
pnpm db:generate            # Gera Prisma Client
pnpm db:push                # Push schema para DB (dev)
pnpm db:migrate             # Cria migration
pnpm db:studio              # Abre Prisma Studio
pnpm db:seed                # Seed inicial
```

## 🎨 Temas (10 opções)

| Tema | Primary | Secondary | Accent | Vibe |
|------|---------|-----------|--------|------|
| **Classic Grid** | #00A86B | #0D1B16 | #FFD700 | Original GridBarber (verde/dourado) |
| **Barber Noir** | #1A1A1A | #2D2D2D | #C9A84C | Elegante, escuro, dourado |
| **Urban Steel** | #2C3E50 | #34495E | #E74C3C | Moderno, azul aço, vermelho |
| **Vintage Cut** | #8B4513 | #A0522D | #D4A573 | Marrom vintage, couro |
| **Fresh Mint** | #00BFA6 | #008F7A | #FF6B6B | Fresco, menta, coral |
| **Midnight Blue** | #1E3A5F | #2C5F8A | #F39C12 | Profissional, azul meia-noite |
| **Rose Gold** | #B76E79 | #D4A5A5 | #F7E7CE | Suave, rosa dourado |
| **Carbon Fiber** | #0F0F0F | #1A1A1A | #00FFFF | Tech, ciano neon |
| **Sunset Barber** | #E85D04 | #FF8C42 | #FFD166 | Quente, laranja pôr do sol |
| **Forest Green** | #2D5016 | #3D6B21 | #A8D08D | Natural, verde floresta |

## 📦 Stack Tecnológica

- **Frontend**: React 18, Vite 5, TailwindCSS 3, React Router 6, Zustand, Lucide React
- **Backend**: Node.js 20, Express 4, Prisma 5, PostgreSQL 15
- **Auth**: JWT (Access + Refresh tokens em httpOnly cookies), bcryptjs
- **Infra**: Docker Compose, Redis 7, MinIO (S3), Mailhog, Nginx
- **Monorepo**: Turborepo 2, pnpm 9, TypeScript 5

## 🔌 API Endpoints

### Auth
- `POST /api/auth/register` - Criar conta
- `POST /api/auth/login` - Login
- `POST /api/auth/refresh` - Renovar access token
- `POST /api/auth/logout` - Logout
- `GET /api/auth/me` - Usuário logado
- `POST /api/auth/impersonate` - Super Admin: impersonar barbearia

### Barbearias
- `GET /api/barbershops` - Listar
- `GET /api/barbershops/:id` - Buscar por ID
- `GET /api/barbershops/slug/:slug` - Buscar por slug (público)
- `POST /api/barbershops` - Criar
- `PUT /api/barbershops/:id` - Atualizar
- `DELETE /api/barbershops/:id` - Excluir
- `POST /api/barbershops/:id/impersonate` - Impersonar

### Profissionais
- `GET /api/professionals` - Listar
- `GET /api/professionals/:id` - Buscar
- `POST /api/professionals` - Criar
- `PUT /api/professionals/:id` - Atualizar
- `DELETE /api/professionals/:id` - Excluir

### Serviços
- `GET /api/services` - Listar
- `GET /api/services/:id` - Buscar
- `POST /api/services` - Criar
- `PUT /api/services/:id` - Atualizar
- `DELETE /api/services/:id` - Excluir

### Agendamentos
- `GET /api/appointments` - Listar (filtros: barbershopId, professionalId, clientId, startDate, endDate)
- `GET /api/appointments/:id` - Buscar
- `POST /api/appointments` - Criar (valida conflitos)
- `PUT /api/appointments/:id` - Atualizar
- `PATCH /api/appointments/:id/status` - Alterar status
- `DELETE /api/appointments/:id` - Excluir

### Clientes
- `GET /api/clients` - Listar (busca por nome/email/phone)
- `GET /api/clients/:id` - Buscar
- `POST /api/clients` - Criar
- `PUT /api/clients/:id` - Atualizar
- `POST /api/clients/:id/stamp` - Adicionar carimbo fidelidade
- `DELETE /api/clients/:id` - Excluir

### Assinaturas
- `GET /api/subscriptions/plans` - Planos ativos (público)
- `GET /api/subscriptions/plans/all` - Todos planos (superadmin)
- `POST /api/subscriptions/plans` - Criar plano (superadmin)
- `GET /api/subscriptions` - Listar assinaturas
- `POST /api/subscriptions` - Criar assinatura
- `POST /api/subscriptions/:id/renew` - Renovar
- `POST /api/subscriptions/:id/cancel` - Cancelar

### Temas
- `GET /api/themes` - Listar todos (10 temas)
- `GET /api/themes/:id` - Buscar tema

### Notificações
- `GET /api/notifications` - Listar
- `POST /api/notifications` - Criar
- `PATCH /api/notifications/:id/read` - Marcar como lida
- `PATCH /api/notifications/read-all` - Marcar todas como lidas

### Pagamentos
- `GET /api/payments` - Listar
- `POST /api/payments` - Criar (gera QR Code Pix automaticamente)
- `POST /api/payments/:id/confirm` - Confirmar pagamento
- `POST /api/payments/webhook/pix` - Webhook banco

### Super Admin
- `GET /api/superadmin/dashboard` - Métricas globais
- `GET /api/superadmin/barbershops` - Gestão de barbearias
- `GET /api/superadmin/settings` - Configurações globais
- `PUT /api/superadmin/settings` - Atualizar configurações globais

## 🌐 Páginas do Frontend

### Públicas
- `/` - Landing Page completa (Hero, Features, How it works, Pricing, FAQ)
- `/login` - Login
- `/register` - Registro (14 dias grátis)
- `/:slug` - Página de agendamento pública (em desenvolvimento)

### Admin (Protegidas)
- `/dashboard` - Dashboard com KPIs e ações rápidas
- `/dashboard/agenda` - Agenda Inteligente (Dia/Semana/Mês, Drag & Drop visual, Conflitos)
- `/dashboard/profissionais` - CRUD Profissionais (comissões, horários, permissões)
- `/dashboard/servicos` - CRUD Serviços (categorias, duração, preço, profissionais)
- `/dashboard/clientes` - CRUD Clientes (busca, tags, fidelidade, histórico)
- `/dashboard/relatorios` - Relatórios (Receita, Ocupação, Clientes, Export PDF/CSV)
- `/dashboard/configuracoes` - Configurações (7 abas: Geral, Tema 10 opções com preview, Redes Sociais 5+WhatsApp+Site, Horários, Notificações 3 canais, Assinatura, Backup)

## 🎯 Funcionalidades Implementadas

### Fase 1: Fundação ✅
- Monorepo Turborepo + pnpm workspaces
- TypeScript strict mode
- Docker Compose (PostgreSQL, Redis, MinIO, Mailhog)
- Prisma Schema completo (20 models)
- JWT Auth (Access + Refresh tokens, httpOnly cookies)
- RBAC (SUPER_ADMIN, ADMIN, PROFESSIONAL, CLIENT)

### Fase 2: Landing Page ✅
- Hero com CTAs e badges
- 8 Cards de funcionalidades
- 4 Passos "Como funciona"
- Preços Mensal/Anual com toggle
- FAQ Accordion (8 perguntas)
- Footer completo

### Fase 3: Super Admin ✅
- Dashboard com métricas (MRR, Churn, Barbearias ativas, Agendamentos/dia)
- Gestão de barbearias com impersonação
- Gestão de planos
- Configurações globais

### Fase 4: Painel Barbearia ✅
- Dashboard com KPIs
- Agenda Inteligente (Dia/Semana/Mês, visual table-based, drag-ready)
- Profissionais (CRUD, comissões %/fixo, permissões agenda, horários)
- Serviços (CRUD, categorias, duração, preço, profissionais habilitados)
- Clientes (CRUD, busca, tags, fidelidade, aniversário, histórico)
- Relatórios (Receita por prof/serviço, ocupação semanal, métricas clientes, export)
- Configurações (7 abas: Geral, Tema 10 opções com preview, Redes Sociais 5+WhatsApp+Site, Horários, Notificações 3 canais, Assinatura, Backup)

### Fase 5: Agendamento Público ✅
- Wizard 4 passos: Serviço → Profissional → Data/Horário → Confirmação
- Calendário interativo com horários disponíveis
- Integração WhatsApp
- Tema dinâmico baseado na barbearia

### Fase 6: Sistema de Temas ✅
- 10 temas predefinidos com CSS Variables
- Seletor visual com preview em tempo real
- Persistência localStorage + banco
- CSS customizado avançado

### Fase 7: Redes Sociais ✅
- 5 plataformas + Site + WhatsApp Business
- Exibição na página pública
- Configuração no admin

### Fase 8: Pagamentos ✅
- Planos: R$ 49,90/mês e R$ 549,90/ano
- Trial 14 dias sem cartão
- Pix com QR Code (BR Code)
- Webhook para confirmação bancária

### Fase 9: Notificações ✅
- Canais: In-App, Email, WhatsApp, Push
- Tipos: Agendamento, Lembrete, Pagamento, Fidelidade, Sistema
- Preferências por canal/tipo

### Fase 10: Deploy Local ✅
- Docker Compose completo
- Nginx reverse proxy
- Healthchecks
- Volumes persistentes

## 📄 Licença

Proprietary - BarberFlow 2026