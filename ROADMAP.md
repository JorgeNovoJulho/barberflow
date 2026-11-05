# BarberFlow - Roadmap Completo

## Visão Geral
Clone exato do GridBarber (gridbarber.com.br) renomeado para **BarberFlow**, com painel administrativo completo, sistema multi-tenant para barbearias, 10 temas de cores, integração de redes sociais, e planos de assinatura.

---

## FASE 1: FUNDAÇÃO E INFRAESTRUTURA (Semana 1-2)

### 1.1 Setup do Monorepo
- [ ] Estrutura: `apps/web` (frontend), `apps/api` (backend), `packages/shared` (tipos/utils), `packages/ui` (componentes)
- [ ] Configuração: Turborepo + pnpm workspaces
- [ ] TypeScript strict mode, ESLint, Prettier, Husky
- [ ] Docker Compose para desenvolvimento local (PostgreSQL, Redis, MinIO)

### 1.2 Banco de Dados (PostgreSQL + Prisma)
```prisma
// Models principais
User, Barbershop, Professional, Service, Appointment, Client
Subscription, Plan, Theme, SocialLinks, LoyaltyCard
AuditLog, Notification, Payment, Invoice
```

### 1.3 Autenticação e Autorização
- [ ] JWT Access + Refresh tokens (httpOnly cookies)
- [ ] RBAC: SUPER_ADMIN, ADMIN, PROFESSIONAL, CLIENT
- [ ] Login social (Google, Apple) - opcional
- [ ] 2FA (TOTP) para admins
- [ ] Recuperação de senha via email

### 1.4 Configuração de Domínio
- [ ] Variáveis de ambiente para domínio dinâmico
- [ ] Subdomínios por barbearia: `barbearia.barberflow.com.br`
- [ ] SSL automático (Let's Encrypt via Traefik/Caddy)
- [ ] Preparado para domínio customizado futuro

---

## FASE 2: LANDING PAGE PÚBLICA (Semana 2-3)

### 2.1 Hero Section
- [ ] Headline: "Gestão inteligente. Agenda organizada."
- [ ] Sub-headline: "Sua barbearia organizada. Seus clientes conectados."
- [ ] CTAs: "Começar teste grátis" + "Encontrar barbearias"
- [ ] Badges: "14 dias grátis", "Sem cartão", "Sem comissão"

### 2.2 Seção de Funcionalidades (8 cards)
- [ ] Agenda inteligente
- [ ] Gestão de profissionais
- [ ] Página personalizada
- [ ] Marketplace BarberFlow
- [ ] Controle de clientes
- [ ] Relatórios
- [ ] Agendamento online
- [ ] Fidelidade

### 2.3 Como Funciona (4 passos)
- [ ] Crie sua conta → Cadastre a barbearia → Configure serviços/equipe → Receba agendamentos

### 2.4 Preços
- [ ] **Mensal: R$ 49,90/mês**
- [ ] **Anual: R$ 549,90/ano** (equivale R$ 45,82/mês - 23% desconto)
- [ ] Toggle mensal/anual com economia destacada
- [ ] CTA: "Começar teste grátis de 14 dias"

### 2.5 FAQ Accordion
- [ ] 8-10 perguntas frequentes

### 2.6 Footer
- [ ] Links: Produto, Suporte, Legal
- [ ] "Feito em [Cidade], SP"
- [ ] Copyright 2026 BarberFlow

---

## FASE 3: PAINEL ADMINISTRATIVO (SUPER ADMIN) (Semana 3-4)

### 3.1 Dashboard Super Admin
- [ ] Métricas globais: MRR, Churn, Barbearias ativas, Agendamentos/dia
- [ ] Gráficos: Crescimento, Receita, Conversão trial→pago
- [ ] Tabela de barbearias com filtros e busca

### 3.2 Gestão de Barbearias
- [ ] CRUD completo
- [ ] Status: Trial, Ativa, Suspensa, Cancelada
- [ ] Impersonar barbearia (login como admin da barbearia)
- [ ] Ver logs de auditoria

### 3.3 Gestão de Planos e Assinaturas
- [ ] CRUD de planos (preço, features, trial days)
- [ ] Visualizar assinaturas ativas/expiradas
- [ ] Gerar cobranças manuais (Pix)
- [ ] Webhook para confirmação de pagamento

### 3.4 Configurações Globais
- [ ] Temas globais (10 temas base)
- [ ] Configurações de email/SMTP
- [ ] Configurações de marketplace
- [ ] Terms of Service / Privacy Policy editor

### 3.5 Acesso Super Admin
- [ ] Email fixo: `jorgericardosalgado@gmail.com`
- [ ] Senha: `jorge0609`
- [ ] Não deletável, não editável por outros admins

---

## FASE 4: PAINEL DA BARBEARIA (ADMIN DA BARBEARIA) (Semana 4-6)

### 4.1 Dashboard da Barbearia
- [ ] Agenda do dia (visualização calendário/lista)
- [ ] KPIs: Receita do dia/semana/mês, Clientes ativos, Taxa ocupação
- [ ] Próximos agendamentos
- [ ] Ações rápidas: Novo agendamento, Novo cliente, Novo profissional

### 4.2 Agenda Inteligente
- [ ] Visualização: Dia, Semana, Mês
- [ ] Filtro por profissional
- [ ] Drag & drop para reagendar
- [ ] Bloqueios de horário (pausas, férias)
- [ ] Conflitos visuais
- [ ] Status: Confirmado, Pendente, Concluído, Cancelado, No-show

### 4.3 Gestão de Profissionais
- [ ] CRUD profissionais
- [ ] Horários de trabalho por dia da semana
- [ ] Pausas/intervalos
- [ ] Serviços que cada profissional executa
- [ ] Comissão por serviço (% ou fixo)
- [ ] Permissões: Ver apenas sua agenda / Ver toda agenda

### 4.4 Serviços
- [ ] CRUD serviços
- [ ] Categorias (Corte, Barba, Hidratação, Combo)
- [ ] Duração, Preço, Descrição
- [ ] Profissionais habilitados
- [ ] Imagem do serviço

### 4.5 Clientes
- [ ] Lista com busca/filtros
- [ ] Perfil completo: Histórico, Preferências, Aniversário, Fidelidade
- [ ] Tags personalizadas
- [ ] Importar/Exportar CSV
- [ ] Comunicação: WhatsApp, Email, SMS

### 4.6 Página Personalizada (Public Booking Page)
- [ ] Subdomínio: `barbearia.barberflow.com.br` ou domínio customizado
- [ ] Customização: Logo, Banner, Cores (tema), Descrição
- [ ] Redes sociais: Instagram, Facebook, TikTok, YouTube, Site próprio
- [ ] SEO: Meta tags, Open Graph
- [ ] Agendamento público: Cliente escolhe serviço → profissional → horário → dados → confirma
- [ ] Integração WhatsApp para confirmação

### 4.7 Marketplace BarberFlow
- [ ] Listagem por cidade/bairro
- [ ] Filtros: Serviço, Preço, Avaliação, Distância
- [ ] Perfil da barbearia no marketplace
- [ ] Avaliações de clientes

### 4.8 Programa de Fidelidade
- [ ] Cartão digital: "X cortes = 1 grátis"
- [ ] Configuração: Quantidade de visitas, Recompensa
- [ ] QR Code para validação
- [ ] Histórico de carimbos/resgates

### 4.9 Relatórios e Analytics
- [ ] Financeiro: Receita, Ticket médio, Por profissional, Por serviço
- [ ] Operacional: Ocupação, No-show rate, Tempo médio
- [ ] Clientes: Novos, Recorrentes, Churn, LTV
- [ ] Exportar PDF/CSV
- [ ] Gráficos interativos (Recharts)

### 4.10 Configurações da Barbearia
- [ ] Dados cadastrais: Nome, CNPJ, Endereço, Telefone, Email
- [ ] **Temas de cores (10 opções)** - ver seção 6
- [ ] **Redes sociais**: Instagram, Facebook, TikTok, YouTube, Site
- [ ] Horário de funcionamento
- [ ] Configurações de notificação (Email, WhatsApp, Push)
- [ ] Integrações: WhatsApp Business API, Google Calendar
- [ ] Backup/Exportação de dados

### 4.11 Assinatura e Pagamentos
- [ ] Status da assinatura: Trial, Ativa, Vencida, Cancelada
- [ ] Dados do plano atual
- [ ] Histórico de pagamentos
- [ ] Gerar boleto/Pix para renovação
- [ ] Upgrade/Downgrade de plano
- [ ] Cancelamento com retenção

---

## FASE 5: APP DO CLIENTE / AGENDAMENTO PÚBLICO (Semana 6-7)

### 5.1 Página de Agendamento Pública
- [ ] Seleção de serviço com duração e preço
- [ ] Seleção de profissional (ou "qualquer um")
- [ ] Calendário com horários disponíveis em tempo real
- [ ] Formulário: Nome, Telefone, Email, Observações
- [ ] Login/Cliente recorrente: Preenchimento automático
- [ ] Confirmação via WhatsApp/Email
- [ ] Lembrete automático (24h e 1h antes)

### 5.2 Portal do Cliente (Opcional)
- [ ] Histórico de agendamentos
- [ ] Cartão fidelidade
- [ ] Reagendar/Cancelar
- [ ] Avaliar profissional/barbearia

---

## FASE 6: SISTEMA DE TEMAS (10 OPÇÕES) (Semana 3-4, paralelo)

### 6.1 Arquitetura de Temas
- [ ] CSS Variables baseadas em design tokens
- [ ] Context API / Zustand para tema ativo
- [ ] Persistência no banco (por barbearia) + localStorage (preview)
- [ ] SSR compatible (next-themes pattern)

### 6.2 10 Temas Predefinidos

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

### 6.3 Seletor de Temas no Admin
- [ ] Preview em tempo real (iframe ou modal)
- [ ] Cards visuais com thumbnail
- [ ] Aplicar instantaneamente na página pública
- [ ] Customização avançada: CSS customizado (opcional)

---

## FASE 7: REDES SOCIAIS E INTEGRAÇÕES (Semana 5-6)

### 7.1 Campos de Redes Sociais
- [ ] Instagram (username ou URL)
- [ ] Facebook (page URL)
- [ ] TikTok (username ou URL)
- [ ] YouTube (channel URL)
- [ ] Site próprio (URL)
- [ ] WhatsApp Business (número com código do país)

### 7.2 Exibição na Página Pública
- [ ] Ícones no header/footer da página da barbearia
- [ ] Links com `target="_blank" rel="noopener"`
- [ ] WhatsApp: Botão flutuante + link no agendamento
- [ ] Open Graph tags para compartilhamento

### 7.3 Integração WhatsApp Business API
- [ ] Templates de mensagem aprovados
- [ ] Confirmação de agendamento
- [ ] Lembrete 24h / 1h
- [ ] Cancelamento/Reagendamento
- [ ] Avaliação pós-atendimento
- [ ] Campanhas de marketing (aniversário, reativação)

---

## FASE 8: SISTEMA DE PAGAMENTOS E ASSINATURAS (Semana 5-6)

### 8.1 Planos
- [ ] **Mensal: R$ 49,90** (cobrança recorrente mensal)
- [ ] **Anual: R$ 549,90** (cobrança única anual - 23% off)

### 8.2 Trial de 14 dias
- [ ] Sem cartão de crédito
- [ ] Acesso completo durante trial
- [ ] Emails de aviso: Dia 7, Dia 12, Dia 14 (último dia)
- [ ] Bloqueio automático após trial sem pagamento

### 8.3 Pagamento via Pix (Manual)
- [ ] Geração de QR Code Pix (BR Code)
- [ ] Chave Pix configurável por barbearia ou global
- [ ] Webhook/Verificação manual de pagamento
- [ ] Comprovante upload pelo usuário
- [ ] Aprovação manual pelo super admin (ou automática via webhook bancário)

### 8.4 Faturas e Recibos
- [ ] Geração automática de PDF
- [ ] Envio por email
- [ ] Histórico no painel
- [ ] NF-e (integração futura com emissor)

---

## FASE 9: NOTIFICAÇÕES E COMUNICAÇÃO (Semana 6-7)

### 9.1 Canais
- [ ] Email (SendGrid/AWS SES/Resend)
- [ ] WhatsApp (Business API)
- [ ] Push (Web Push API / PWA)
- [ ] In-app (Notification Center)

### 9.2 Tipos de Notificação
- [ ] Novo agendamento (profissional + admin)
- [ ] Lembrete cliente (24h, 1h)
- [ ] Confirmação/Cancelamento
- [ ] Pagamento vencido/confirmado
- [ ] Fim de trial
- [ ] Aniversário cliente
- [ ] Fidelidade completa
- [ ] Sistema (manutenção, updates)

### 9.3 Preferências
- [ ] Por barbearia: Ativar/desativar por canal
- [ ] Por profissional: Receber apenas seus agendamentos
- [ ] Por cliente: Opt-out

---

## FASE 10: TESTES, POLIMENTO E DEPLOY LOCAL (Semana 7-8)

### 10.1 Testes
- [ ] Unit: Jest + React Testing Library (cobertura > 80%)
- [ ] Integration: API routes, Database
- [ ] E2E: Playwright (fluxos críticos: signup, agendamento, pagamento)
- [ ] Visual: Chromatic/Storybook

### 10.2 Performance
- [ ] Lighthouse > 90
- [ ] Bundle analysis
- [ ] Database indexes
- [ ] Redis caching (sessões, rate limit, agenda)

### 10.3 Segurança
- [ ] Rate limiting (login, API, agendamento público)
- [ ] CSP, HSTS, X-Frame-Options
- [ ] Input sanitization (XSS)
- [ ] SQL Injection prevention (Prisma)
- [ ] Audit logs sensíveis

### 10.4 Deploy Local (Desenvolvimento)
```bash
# Docker Compose
services:
  postgres: 15-alpine
  redis: 7-alpine
  minio: latest (S3 compatível para uploads)
  api: Node.js + Prisma
  web: Vite/React + Nginx
  mailhog: Test emails
```

### 10.5 Documentação
- [ ] README com setup local
- [ ] API Docs (Swagger/OpenAPI)
- [ ] Storybook componentes
- [ ] Guia de temas
- [ ] Guia de deploy produção

---

## ESTRUTURA DE PASTAS PROPOSTA

```
BarberFlow/
├── apps/
│   ├── web/                    # Frontend (React + Vite + Tailwind)
│   │   ├── src/
│   │   │   ├── pages/          # Landing, Auth, Dashboard, Public
│   │   │   ├── components/     # UI components + feature components
│   │   │   ├── hooks/          # Custom hooks
│   │   │   ├── stores/         # Zustand stores (auth, theme, agenda)
│   │   │   ├── lib/            # Utils, API client, validators
│   │   │   ├── styles/         # Global CSS, themes.css
│   │   │   └── types/          # TypeScript types
│   │   └── package.json
│   │
│   └── api/                    # Backend (Node.js + Express + Prisma)
│       ├── src/
│       │   ├── modules/        # Feature modules
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
│   ├── shared/                 # Tipos, validações, constantes compartilhadas
│   ├── ui/                     # Componentes base (Button, Input, Modal, etc)
│   └── database/               # Prisma schema + migrations
│
├── docker/
│   ├── docker-compose.yml
│   ├── docker-compose.prod.yml
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

---

## AGENTES SUGERIDOS PARA DIVISÃO DE TAREFAS

| Agente | Responsabilidade | Fases |
|--------|------------------|-------|
| **Infra Agent** | Setup monorepo, Docker, CI/CD, DB, Auth base | 1 |
| **Landing Agent** | Landing page pública, SEO, Preços, FAQ | 2 |
| **SuperAdmin Agent** | Painel Super Admin, Gestão global, Planos | 3 |
| **BarbershopAdmin Agent** | Painel da barbearia (Agenda, Profissionais, Serviços, Clientes, Relatórios) | 4 |
| **PublicBooking Agent** | Página de agendamento pública, Marketplace, Fidelidade | 5 |
| **Theme Agent** | Sistema de 10 temas, CSS variables, Seletor visual | 6 |
| **SocialPayments Agent** | Redes sociais, WhatsApp API, Pix, Assinaturas, Faturas | 7, 8 |
| **Notifications Agent** | Sistema multi-canal, Templates, Preferências | 9 |
| **QA Agent** | Testes, Performance, Segurança, Deploy local, Docs | 10 |

---

## ORDEM DE EXECUÇÃO SUGERIDA (CRONOGRAMA)

```
Semana 1:  ████████░░░░░░░░░░░░░░░░░░░░░  Infra + DB + Auth
Semana 2:  ░░████████████░░░░░░░░░░░░░░  Landing + Temas (início)
Semana 3:  ░░░░████████████████░░░░░░░░  SuperAdmin + Temas (conclusão)
Semana 4:  ░░░░░░████████████████████░░  BarbershopAdmin (core: agenda, prof, serviços)
Semana 5:  ░░░░░░░░████████████████████  BarbershopAdmin (clientes, relatórios, config) + Social/Payments
Semana 6:  ░░░░░░░░░░██████████████████  PublicBooking + Marketplace + Fidelidade + Notifications
Semana 7:  ░░░░░░░░░░░░████████████████  Testes + Polimento + Performance
Semana 8:  ░░░░░░░░░░░░░░██████████████  Deploy local + Docs + Entrega
```

---

## CHECKLIST DE ENTREGA FINAL

- [ ] Landing page idêntica ao GridBarber (com marca BarberFlow)
- [ ] Super Admin funcional com credenciais fixas
- [ ] Painel da barbearia completo (todas as 11 seções)
- [ ] Agenda inteligente com drag-drop, conflitos, filtros
- [ ] Página pública de agendamento funcional
- [ ] Marketplace com busca por cidade
- [ ] Programa de fidelidade digital
- [ ] 10 temas funcionando com preview e persistência
- [ ] Campos de redes sociais (5 plataformas + site + WhatsApp)
- [ ] Planos: R$ 49,90/mês e R$ 549,90/ano
- [ ] Trial 14 dias sem cartão + bloqueio automático
- [ ] Pagamento Pix com QR Code + verificação
- [ ] Notificações Email + WhatsApp + In-app
- [ ] Deploy local via Docker Compose funcionando
- [ ] Documentação completa
- [ ] Testes E2E passando

---

## PRÓXIMOS PASSOS IMEDIATOS

1. **Aprovar roadmap** - Confirmar escopo e cronograma
2. **Definir stack final** - Confirmar React/Vite vs Next.js, Express vs Fastify/NestJS
3. **Iniciar Fase 1** - Setup monorepo + Docker + Prisma + Auth base
4. **Criar agentes** - Dividir tarefas conforme tabela acima
5. **Primeira entrega** - Landing page + Auth funcionando (Semana 2)

---

*Documento vivo - Atualizar conforme decisões técnicas e feedback do cliente*