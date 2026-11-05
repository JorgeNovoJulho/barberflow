import { Router } from 'express';
import { z } from 'zod';

const router = Router();

const plans = new Map();
const subscriptions = new Map();

// Default plans
const defaultPlans = [
  { id: 'plan-monthly', name: 'Mensal', priceMonthly: 49.90, priceYearly: 549.90, features: ['Agenda ilimitada', 'Até 5 profissionais', 'Página personalizada', 'Marketplace', 'Fidelidade', 'Relatórios básicos', 'Suporte email'], maxProfessionals: 5, trialDays: 14, active: true },
  { id: 'plan-yearly', name: 'Anual', priceMonthly: 49.90, priceYearly: 549.90, features: ['Tudo do mensal', 'Profissionais ilimitados', 'Relatórios avançados', 'WhatsApp API', 'API desenvolvedores', 'Suporte prioritário', 'Domínio customizado'], maxProfessionals: null, trialDays: 14, active: true },
];
defaultPlans.forEach(p => plans.set(p.id, { ...p, createdAt: new Date(), updatedAt: new Date() }));

const planSchema = z.object({
  name: z.string().min(2),
  priceMonthly: z.number().min(0),
  priceYearly: z.number().min(0),
  features: z.array(z.string()),
  maxProfessionals: z.number().nullable().optional(),
  trialDays: z.number().default(14),
  active: z.boolean().default(true),
});

router.get('/plans', (req, res) => {
  res.json(Array.from(plans.values()).filter(p => p.active));
});

router.get('/plans/all', (req, res) => {
  if ((req as any).user?.role !== 'SUPER_ADMIN') return res.status(403).json({ error: 'Acesso negado' });
  res.json(Array.from(plans.values()));
});

router.post('/plans', (req, res) => {
  if ((req as any).user?.role !== 'SUPER_ADMIN') return res.status(403).json({ error: 'Acesso negado' });
  try {
    const data = planSchema.parse(req.body);
    const plan = { id: `plan-${crypto.randomUUID()}`, ...data, createdAt: new Date(), updatedAt: new Date() };
    plans.set(plan.id, plan);
    res.status(201).json(plan);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    res.status(500).json({ error: 'Erro ao criar plano' });
  }
});

router.put('/plans/:id', (req, res) => {
  if ((req as any).user?.role !== 'SUPER_ADMIN') return res.status(403).json({ error: 'Acesso negado' });
  try {
    const plan = plans.get(req.params.id);
    if (!plan) return res.status(404).json({ error: 'Plano não encontrado' });
    const data = planSchema.partial().parse(req.body);
    const updated = { ...plan, ...data, updatedAt: new Date() };
    plans.set(req.params.id, updated);
    res.json(updated);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    res.status(500).json({ error: 'Erro ao atualizar plano' });
  }
});

router.get('/', (req, res) => {
  const barbershopId = req.query.barbershopId as string;
  const userBarbershopId = (req as any).user?.barbershopId;
  const userRole = (req as any).user?.role;

  let result = Array.from(subscriptions.values());

  if (userRole !== 'SUPER_ADMIN') {
    result = result.filter(s => s.barbershopId === userBarbershopId);
  }

  if (barbershopId) {
    result = result.filter(s => s.barbershopId === barbershopId);
  }

  res.json(result);
});

router.get('/:id', (req, res) => {
  const sub = subscriptions.get(req.params.id);
  if (!sub) return res.status(404).json({ error: 'Assinatura não encontrada' });
  res.json(sub);
});

router.post('/', (req, res) => {
  try {
    const { barbershopId, planId } = req.body;
    if (!barbershopId || !planId) return res.status(400).json({ error: 'barbershopId e planId obrigatórios' });

    const plan = plans.get(planId);
    if (!plan) return res.status(404).json({ error: 'Plano não encontrado' });

    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + plan.trialDays);

    const sub = {
      id: crypto.randomUUID(),
      barbershopId,
      planId,
      status: 'TRIAL',
      trialEndsAt,
      currentPeriodEnd: trialEndsAt,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    subscriptions.set(sub.id, sub);
    res.status(201).json(sub);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao criar assinatura' });
  }
});

router.post('/:id/renew', (req, res) => {
  const sub = subscriptions.get(req.params.id);
  if (!sub) return res.status(404).json({ error: 'Assinatura não encontrada' });

  const plan = plans.get(sub.planId);
  if (!plan) return res.status(404).json({ error: 'Plano não encontrado' });

  const now = new Date();
  const periodEnd = sub.currentPeriodEnd && new Date(sub.currentPeriodEnd) > now ? new Date(sub.currentPeriodEnd) : now;
  periodEnd.setMonth(periodEnd.getMonth() + 1);

  const updated = {
    ...sub,
    status: 'ACTIVE',
    currentPeriodEnd: periodEnd,
    trialEndsAt: undefined,
    updatedAt: new Date(),
  };
  subscriptions.set(req.params.id, updated);
  res.json(updated);
});

router.post('/:id/cancel', (req, res) => {
  const sub = subscriptions.get(req.params.id);
  if (!sub) return res.status(404).json({ error: 'Assinatura não encontrada' });

  const updated = {
    ...sub,
    status: 'CANCELLED',
    cancelledAt: new Date(),
    updatedAt: new Date(),
  };
  subscriptions.set(req.params.id, updated);
  res.json(updated);
});

export default router;