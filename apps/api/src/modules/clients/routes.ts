import { Router } from 'express';
import { z } from 'zod';

const router = Router();

const clients = new Map();

const clientSchema = z.object({
  barbershopId: z.string().uuid(),
  name: z.string().min(2),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  birthday: z.string().datetime().optional(),
  notes: z.string().optional(),
  tags: z.array(z.string()).default([]),
});

router.get('/', (req, res) => {
  const barbershopId = req.query.barbershopId as string;
  const search = req.query.search as string;
  const userBarbershopId = (req as any).user?.barbershopId;

  let result = Array.from(clients.values());

  if (barbershopId) {
    result = result.filter(c => c.barbershopId === barbershopId);
  } else if (userBarbershopId) {
    result = result.filter(c => c.barbershopId === userBarbershopId);
  }

  if (search) {
    const s = search.toLowerCase();
    result = result.filter(c =>
      c.name.toLowerCase().includes(s) ||
      c.email?.toLowerCase().includes(s) ||
      c.phone?.includes(s)
    );
  }

  res.json(result);
});

router.get('/:id', (req, res) => {
  const client = clients.get(req.params.id);
  if (!client) return res.status(404).json({ error: 'Cliente não encontrado' });
  res.json(client);
});

router.post('/', (req, res) => {
  try {
    const data = clientSchema.parse(req.body);
    const client = {
      id: crypto.randomUUID(),
      ...data,
      loyaltyStamps: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    clients.set(client.id, client);
    res.status(201).json(client);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    res.status(500).json({ error: 'Erro ao criar cliente' });
  }
});

router.put('/:id', (req, res) => {
  try {
    const client = clients.get(req.params.id);
    if (!client) return res.status(404).json({ error: 'Cliente não encontrado' });

    const data = clientSchema.partial().parse(req.body);
    const updated = { ...client, ...data, updatedAt: new Date() };
    clients.set(req.params.id, updated);
    res.json(updated);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    res.status(500).json({ error: 'Erro ao atualizar cliente' });
  }
});

router.post('/:id/stamp', (req, res) => {
  const client = clients.get(req.params.id);
  if (!client) return res.status(404).json({ error: 'Cliente não encontrado' });

  const updated = {
    ...client,
    loyaltyStamps: client.loyaltyStamps + 1,
    lastVisit: new Date(),
    updatedAt: new Date(),
  };
  clients.set(req.params.id, updated);
  res.json(updated);
});

router.delete('/:id', (req, res) => {
  if (!clients.has(req.params.id)) return res.status(404).json({ error: 'Cliente não encontrado' });
  clients.delete(req.params.id);
  res.json({ message: 'Cliente excluído' });
});

export default router;