import { Router } from 'express';

const router = Router();

// All superadmin routes require SUPER_ADMIN role
router.use((req, res, next) => {
  if ((req as any).user?.role !== 'SUPER_ADMIN') {
    return res.status(403).json({ error: 'Acesso restrito ao Super Admin' });
  }
  next();
});

// Dashboard metrics
router.get('/dashboard', (req, res) => {
  res.json({
    mrr: 45600,
    churn: 3.2,
    activeBarbershops: 127,
    appointmentsToday: 1456,
    growth: { month: 12.5, quarter: 28.3 },
    revenue: { month: 45600, quarter: 132000, year: 520000 },
    trialToPaid: 23.5,
  });
});

// Barbershops management
router.get('/barbershops', (req, res) => {
  // Return all barbershops with filters
  res.json({ barbershops: [], total: 0, page: 1, limit: 20 });
});

router.get('/barbershops/:id', (req, res) => {
  res.json({ id: req.params.id, name: 'Barbearia Exemplo', status: 'ACTIVE' });
});

router.post('/barbershops/:id/impersonate', (req, res) => {
  res.json({ token: `superadmin_impersonate_${req.params.id}`, barbershopId: req.params.id });
});

router.patch('/barbershops/:id/status', (req, res) => {
  const { status } = req.body;
  res.json({ id: req.params.id, status });
});

// Global settings
router.get('/settings', (req, res) => {
  res.json({
    themes: [],
    email: { host: '', port: 587, user: '', from: 'noreply@barberflow.com' },
    marketplace: { enabled: true, radius: 50 },
    legal: { termsUrl: '', privacyUrl: '' },
  });
});

router.put('/settings', (req, res) => {
  res.json({ message: 'Configurações globais atualizadas' });
});

export default router;