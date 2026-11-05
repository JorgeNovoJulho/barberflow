import { Router } from 'express';
import { z } from 'zod';

const router = Router();

const notifications = new Map();

const notificationSchema = z.object({
  barbershopId: z.string().uuid(),
  userId: z.string().uuid().optional(),
  type: z.string(),
  title: z.string(),
  message: z.string(),
  data: z.record(z.any()).optional(),
  channel: z.array(z.enum(['IN_APP', 'EMAIL', 'WHATSAPP', 'PUSH'])).default(['IN_APP']),
});

router.get('/', (req, res) => {
  const barbershopId = req.query.barbershopId as string;
  const userId = (req as any).user?.id;
  const userBarbershopId = (req as any).user?.barbershopId;
  const unread = req.query.unread === 'true';

  let result = Array.from(notifications.values());

  if (barbershopId) {
    result = result.filter(n => n.barbershopId === barbershopId);
  } else if (userBarbershopId) {
    result = result.filter(n => n.barbershopId === userBarbershopId);
  }

  if (userId) {
    result = result.filter(n => !n.userId || n.userId === userId);
  }

  if (unread) {
    result = result.filter(n => !n.read);
  }

  result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  res.json(result);
});

router.post('/', (req, res) => {
  try {
    const data = notificationSchema.parse(req.body);
    const notif = {
      id: crypto.randomUUID(),
      ...data,
      read: false,
      sentAt: new Date(),
      createdAt: new Date(),
    };
    notifications.set(notif.id, notif);
    res.status(201).json(notif);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    res.status(500).json({ error: 'Erro ao criar notificação' });
  }
});

router.patch('/:id/read', (req, res) => {
  const notif = notifications.get(req.params.id);
  if (!notif) return res.status(404).json({ error: 'Notificação não encontrada' });

  const updated = { ...notif, read: true };
  notifications.set(req.params.id, updated);
  res.json(updated);
});

router.patch('/read-all', (req, res) => {
  const barbershopId = req.query.barbershopId as string;
  const userId = (req as any).user?.id;

  for (const [id, notif] of notifications.entries()) {
    if (notif.barbershopId === barbershopId && (!notif.userId || notif.userId === userId)) {
      notifications.set(id, { ...notif, read: true });
    }
  }
  res.json({ message: 'Todas marcadas como lidas' });
});

export default router;