import { Router } from 'express';
import { z } from 'zod';

const router = Router();

const appointments = new Map();

const appointmentSchema = z.object({
  barbershopId: z.string().uuid(),
  professionalId: z.string().uuid(),
  serviceId: z.string().uuid(),
  clientId: z.string().uuid(),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  status: z.enum(['PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW']).default('PENDING'),
  notes: z.string().optional(),
  price: z.number().min(0),
});

router.get('/', (req, res) => {
  const barbershopId = req.query.barbershopId as string;
  const professionalId = req.query.professionalId as string;
  const clientId = req.query.clientId as string;
  const startDate = req.query.startDate as string;
  const endDate = req.query.endDate as string;
  const userBarbershopId = (req as any).user?.barbershopId;

  let result = Array.from(appointments.values());

  if (barbershopId) {
    result = result.filter(a => a.barbershopId === barbershopId);
  } else if (userBarbershopId) {
    result = result.filter(a => a.barbershopId === userBarbershopId);
  }

  if (professionalId) result = result.filter(a => a.professionalId === professionalId);
  if (clientId) result = result.filter(a => a.clientId === clientId);
  if (startDate) result = result.filter(a => new Date(a.startTime) >= new Date(startDate));
  if (endDate) result = result.filter(a => new Date(a.startTime) <= new Date(endDate));

  result.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  res.json(result);
});

router.get('/:id', (req, res) => {
  const apt = appointments.get(req.params.id);
  if (!apt) return res.status(404).json({ error: 'Agendamento não encontrado' });
  res.json(apt);
});

router.post('/', (req, res) => {
  try {
    const data = appointmentSchema.parse(req.body);

    // Check for conflicts
    const conflict = Array.from(appointments.values()).find(a =>
      a.professionalId === data.professionalId &&
      a.status !== 'CANCELLED' &&
      new Date(a.startTime) < new Date(data.endTime) &&
      new Date(a.endTime) > new Date(data.startTime)
    );

    if (conflict) {
      return res.status(409).json({ error: 'Horário conflita com outro agendamento' });
    }

    const apt = {
      id: crypto.randomUUID(),
      ...data,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    appointments.set(apt.id, apt);
    res.status(201).json(apt);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    res.status(500).json({ error: 'Erro ao criar agendamento' });
  }
});

router.put('/:id', (req, res) => {
  try {
    const apt = appointments.get(req.params.id);
    if (!apt) return res.status(404).json({ error: 'Agendamento não encontrado' });

    const data = appointmentSchema.partial().parse(req.body);

    // Check conflicts if time changed
    if (data.startTime || data.endTime || data.professionalId) {
      const start = data.startTime || apt.startTime;
      const end = data.endTime || apt.endTime;
      const profId = data.professionalId || apt.professionalId;

      const conflict = Array.from(appointments.values()).find(a =>
        a.id !== apt.id &&
        a.professionalId === profId &&
        a.status !== 'CANCELLED' &&
        new Date(a.startTime) < new Date(end) &&
        new Date(a.endTime) > new Date(start)
      );

      if (conflict) {
        return res.status(409).json({ error: 'Horário conflita com outro agendamento' });
      }
    }

    const updated = { ...apt, ...data, updatedAt: new Date() };
    appointments.set(req.params.id, updated);
    res.json(updated);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    res.status(500).json({ error: 'Erro ao atualizar agendamento' });
  }
});

router.patch('/:id/status', (req, res) => {
  const apt = appointments.get(req.params.id);
  if (!apt) return res.status(404).json({ error: 'Agendamento não encontrado' });

  const { status } = req.body;
  if (!['PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(status)) {
    return res.status(400).json({ error: 'Status inválido' });
  }

  const updated = { ...apt, status, updatedAt: new Date() };
  appointments.set(req.params.id, updated);
  res.json(updated);
});

router.delete('/:id', (req, res) => {
  if (!appointments.has(req.params.id)) return res.status(404).json({ error: 'Agendamento não encontrado' });
  appointments.delete(req.params.id);
  res.json({ message: 'Agendamento excluído' });
});

export default router;