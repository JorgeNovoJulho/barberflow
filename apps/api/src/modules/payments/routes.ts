import { Router } from 'express';
import { z } from 'zod';

const router = Router();

const payments = new Map();

const paymentSchema = z.object({
  subscriptionId: z.string().uuid(),
  amount: z.number().min(0),
  method: z.enum(['PIX', 'CREDIT_CARD', 'BANK_TRANSFER', 'CASH']),
  pixQrCode: z.string().optional(),
  pixCode: z.string().optional(),
});

router.get('/', (req, res) => {
  const subscriptionId = req.query.subscriptionId as string;
  const userBarbershopId = (req as any).user?.barbershopId;

  let result = Array.from(payments.values());

  if (subscriptionId) {
    result = result.filter(p => p.subscriptionId === subscriptionId);
  }

  res.json(result);
});

router.get('/:id', (req, res) => {
  const payment = payments.get(req.params.id);
  if (!payment) return res.status(404).json({ error: 'Pagamento não encontrado' });
  res.json(payment);
});

router.post('/', (req, res) => {
  try {
    const data = paymentSchema.parse(req.body);

    // Generate Pix QR Code if method is PIX
    let pixQrCode = data.pixQrCode;
    let pixCode = data.pixCode;

    if (data.method === 'PIX' && !pixCode) {
      // In production, integrate with Banco Central Pix API
      pixCode = `00020126580014br.gov.bcb.pix0136${crypto.randomUUID()}520400005303986540${data.amount.toFixed(2)}5802BR5913BarberFlow6009SAO PAULO62070503***6304`;
      pixQrCode = `data:image/png;base64,${Buffer.from(pixCode).toString('base64')}`; // placeholder
    }

    const payment = {
      id: crypto.randomUUID(),
      ...data,
      pixQrCode,
      pixCode,
      status: 'PENDING',
      createdAt: new Date(),
    };
    payments.set(payment.id, payment);
    res.status(201).json(payment);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    res.status(500).json({ error: 'Erro ao criar pagamento' });
  }
});

router.post('/:id/confirm', (req, res) => {
  const payment = payments.get(req.params.id);
  if (!payment) return res.status(404).json({ error: 'Pagamento não encontrado' });

  const updated = {
    ...payment,
    status: 'CONFIRMED',
    confirmedAt: new Date(),
  };
  payments.set(req.params.id, updated);
  res.json(updated);
});

router.post('/webhook/pix', (req, res) => {
  // Webhook for bank Pix confirmation
  const { txid, status } = req.body;

  for (const [id, payment] of payments.entries()) {
    if (payment.pixCode?.includes(txid) || payment.id === txid) {
      const updated = {
        ...payment,
        status: status === 'CONFIRMED' ? 'CONFIRMED' : 'FAILED',
        confirmedAt: status === 'CONFIRMED' ? new Date() : undefined,
      };
      payments.set(id, updated);
      break;
    }
  }

  res.json({ received: true });
});

export default router;