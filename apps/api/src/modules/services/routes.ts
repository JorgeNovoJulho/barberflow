import { Router } from 'express';
import { z } from 'zod';

const router = Router();

const services = new Map();

const serviceSchema = z.object({
  barbershopId: z.string().uuid(),
  name: z.string().min(2),
  description: z.string().optional(),
  category: z.enum(['CORTE', 'BARBA', 'HIDRATACAO', 'COMBO', 'OUTRO']).default('OUTRO'),
  duration: z.number().min(5).max(480),
  price: z.number().min(0),
  imageUrl: z.string().url().optional(),
  professionals: z.array(z.string()).default([]),
});

router.get('/', (req, res) => {
  const barbershopId = req.query.barbershopId as string;
  const userBarbershopId = (req as any).user?.barbershopId;

  let result = Array.from(services.values());

  if (barbershopId) {
    result = result.filter(s => s.barbershopId === barbershopId);
  } else if (userBarbershopId) {
    result = result.filter(s => s.barbershopId === userBarbershopId);
  }

  res.json(result);
});

router.get('/:id', (req, res) => {
  const service = services.get(req.params.id);
  if (!service) return res.status(404).json({ error: 'Serviço não encontrado' });
  res.json(service);
});

router.post('/', (req, res) => {
  try {
    const data = serviceSchema.parse(req.body);
    const service = {
      id: crypto.randomUUID(),
      ...data,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    services.set(service.id, service);
    res.status(201).json(service);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    res.status(500).json({ error: 'Erro ao criar serviço' });
  }
});

router.put('/:id', (req, res) => {
  try {
    const service = services.get(req.params.id);
    if (!service) return res.status(404).json({ error: 'Serviço não encontrado' });

    const data = serviceSchema.partial().parse(req.body);
    const updated = { ...service, ...data, updatedAt: new Date() };
    services.set(req.params.id, updated);
    res.json(updated);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    res.status(500).json({ error: 'Erro ao atualizar serviço' });
  }
});

router.delete('/:id', (req, res) => {
  if (!services.has(req.params.id)) return res.status(404).json({ error: 'Serviço não encontrado' });
  services.delete(req.params.id);
  res.json({ message: 'Serviço excluído' });
});

export default router;