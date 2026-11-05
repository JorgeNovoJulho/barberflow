import { Router } from 'express';
import { z } from 'zod';

const router = Router();

const barbershops = new Map();

const barbershopSchema = z.object({
  name: z.string().min(2),
  slug: z.string().min(2).regex(/^[a-z0-9-]+$/),
  cnpj: z.string().optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  description: z.string().optional(),
  themeId: z.string().default('classic-grid'),
  workingHours: z.object({
    monday: z.object({ open: z.string(), close: z.string(), closed: z.boolean() }),
    tuesday: z.object({ open: z.string(), close: z.string(), closed: z.boolean() }),
    wednesday: z.object({ open: z.string(), close: z.string(), closed: z.boolean() }),
    thursday: z.object({ open: z.string(), close: z.string(), closed: z.boolean() }),
    friday: z.object({ open: z.string(), close: z.string(), closed: z.boolean() }),
    saturday: z.object({ open: z.string(), close: z.string(), closed: z.boolean() }),
    sunday: z.object({ open: z.string(), close: z.string(), closed: z.boolean() }),
  }).optional(),
});

router.get('/', (req, res) => {
  const userRole = (req as any).user?.role;
  const userId = (req as any).user?.id;

  let result = Array.from(barbershops.values());

  if (userRole !== 'SUPER_ADMIN') {
    result = result.filter(b => b.ownerId === userId);
  }

  res.json(result);
});

router.get('/:id', (req, res) => {
  const shop = barbershops.get(req.params.id);
  if (!shop) return res.status(404).json({ error: 'Barbearia não encontrada' });
  res.json(shop);
});

router.get('/slug/:slug', (req, res) => {
  const shop = Array.from(barbershops.values()).find(b => b.slug === req.params.slug);
  if (!shop) return res.status(404).json({ error: 'Barbearia não encontrada' });
  res.json(shop);
});

router.post('/', (req, res) => {
  try {
    const data = barbershopSchema.parse(req.body);
    const userId = (req as any).user?.id;

    if (barbershops.has(data.slug)) {
      return res.status(400).json({ error: 'Slug já em uso' });
    }

    const shop = {
      id: crypto.randomUUID(),
      ...data,
      ownerId: userId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    barbershops.set(shop.id, shop);
    res.status(201).json(shop);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    res.status(500).json({ error: 'Erro ao criar barbearia' });
  }
});

router.put('/:id', (req, res) => {
  try {
    const shop = barbershops.get(req.params.id);
    if (!shop) return res.status(404).json({ error: 'Barbearia não encontrada' });

    const data = barbershopSchema.partial().parse(req.body);
    const updated = { ...shop, ...data, updatedAt: new Date() };
    barbershops.set(req.params.id, updated);
    res.json(updated);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    res.status(500).json({ error: 'Erro ao atualizar barbearia' });
  }
});

router.delete('/:id', (req, res) => {
  if (!barbershops.has(req.params.id)) return res.status(404).json({ error: 'Barbearia não encontrada' });
  barbershops.delete(req.params.id);
  res.json({ message: 'Barbearia excluída' });
});

router.post('/:id/impersonate', (req, res) => {
  const shop = barbershops.get(req.params.id);
  if (!shop) return res.status(404).json({ error: 'Barbearia não encontrada' });

  // Generate impersonation token
  const token = `impersonate_${shop.id}_${Date.now()}`;
  res.json({ token, barbershop: shop });
});

export default router;