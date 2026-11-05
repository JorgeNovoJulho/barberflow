import { Router } from 'express';
import { z } from 'zod';

const router = Router();

const professionals = new Map();

const professionalSchema = z.object({
  barbershopId: z.string().uuid(),
  name: z.string().min(2),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  commissionType: z.enum(['PERCENTAGE', 'FIXED']).default('PERCENTAGE'),
  commissionValue: z.number().default(0),
  canViewAllAgenda: z.boolean().default(false),
  workingHours: z.any().optional(),
  services: z.array(z.string()).default([]),
});

router.get('/', (req, res) => {
  const barbershopId = req.query.barbershopId as string;
  const userRole = (req as any).user?.role;
  const userBarbershopId = (req as any).user?.barbershopId;

  let result = Array.from(professionals.values());

  if (userRole !== 'SUPER_ADMIN') {
    result = result.filter(p => p.barbershopId === userBarbershopId);
  }

  if (barbershopId) {
    result = result.filter(p => p.barbershopId === barbershopId);
  }

  res.json(result);
});

router.get('/:id', (req, res) => {
  const prof = professionals.get(req.params.id);
  if (!prof) return res.status(404).json({ error: 'Profissional não encontrado' });
  res.json(prof);
});

router.post('/', (req, res) => {
  try {
    const data = professionalSchema.parse(req.body);
    const prof = {
      id: crypto.randomUUID(),
      ...data,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    professionals.set(prof.id, prof);
    res.status(201).json(prof);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    res.status(500).json({ error: 'Erro ao criar profissional' });
  }
});

router.put('/:id', (req, res) => {
  try {
    const prof = professionals.get(req.params.id);
    if (!prof) return res.status(404).json({ error: 'Profissional não encontrado' });

    const data = professionalSchema.partial().parse(req.body);
    const updated = { ...prof, ...data, updatedAt: new Date() };
    professionals.set(req.params.id, updated);
    res.json(updated);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    res.status(500).json({ error: 'Erro ao atualizar profissional' });
  }
});

router.delete('/:id', (req, res) => {
  if (!professionals.has(req.params.id)) return res.status(404).json({ error: 'Profissional não encontrado' });
  professionals.delete(req.params.id);
  res.json({ message: 'Profissional excluído' });
});

export default router;