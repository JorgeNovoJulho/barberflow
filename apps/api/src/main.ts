import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';

import authRoutes from './modules/auth/routes.js';
import barbershopRoutes from './modules/barbershops/routes.js';
import professionalRoutes from './modules/professionals/routes.js';
import serviceRoutes from './modules/services/routes.js';
import appointmentRoutes from './modules/appointments/routes.js';
import clientRoutes from './modules/clients/routes.js';
import subscriptionRoutes from './modules/subscriptions/routes.js';
import themeRoutes from './modules/themes/routes.js';
import notificationRoutes from './modules/notifications/routes.js';
import paymentRoutes from './modules/payments/routes.js';
import superadminRoutes from './modules/superadmin/routes.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

const JWT_SECRET = process.env.JWT_SECRET || 'barberflow-super-secret-key-change-in-production-min-32-chars';

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());

// Auth middleware
const authenticate = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : req.cookies?.accessToken;

  if (!token) {
    return res.status(401).json({ error: 'Token não fornecido' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET) as { id: string; email: string; role: string; barbershopId?: string };
    (req as any).user = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido' });
  }
};

// Optional auth - doesn't fail if no token
const optionalAuth = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : req.cookies?.accessToken;

  if (token) {
    try {
      const payload = jwt.verify(token, JWT_SECRET) as { id: string; email: string; role: string; barbershopId?: string };
      (req as any).user = payload;
    } catch {
      // Ignore invalid token
    }
  }
  next();
};

// Health check
app.get('/health', (_, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// Public routes (no auth required)
app.use('/api/auth', authRoutes);
app.use('/api/themes', themeRoutes);

// Protected routes (auth required)
app.use('/api/barbershops', authenticate, barbershopRoutes);
app.use('/api/professionals', authenticate, professionalRoutes);
app.use('/api/services', authenticate, serviceRoutes);
app.use('/api/appointments', authenticate, appointmentRoutes);
app.use('/api/clients', authenticate, clientRoutes);
app.use('/api/subscriptions', authenticate, subscriptionRoutes);
app.use('/api/notifications', authenticate, notificationRoutes);
app.use('/api/payments', authenticate, paymentRoutes);

// Super admin routes
app.use('/api/superadmin', authenticate, superadminRoutes);

// Public booking page (by slug) - optional auth
app.get('/api/public/barbershops/:slug', optionalAuth, async (req, res) => {
  // In production, fetch from database
  res.json({
    name: 'Barbearia Exemplo',
    description: 'A melhor barbearia da região',
    themeId: 'classic-grid',
    services: [
      { id: '1', name: 'Corte', duration: 30, price: 35, category: 'CORTE', professionals: ['1', '2'] },
      { id: '2', name: 'Barba', duration: 20, price: 25, category: 'BARBA', professionals: ['1'] },
      { id: '3', name: 'Corte + Barba', duration: 45, price: 55, category: 'COMBO', professionals: ['1', '2'] },
      { id: '4', name: 'Combo Completo', duration: 60, price: 80, category: 'COMBO', professionals: ['1', '2', '3'] },
    ],
    professionals: [
      { id: '1', name: 'João Silva' },
      { id: '2', name: 'Maria Santos' },
      { id: '3', name: 'Pedro Costa' },
    ],
  });
});

// 404
app.use((_, res) => res.status(404).json({ error: 'Rota não encontrada' }));

// Error handler
app.use((err: Error, _: express.Request, res: express.Response, __: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

app.listen(PORT, () => {
  console.log(`🚀 API rodando na porta ${PORT}`);
});

export default app;