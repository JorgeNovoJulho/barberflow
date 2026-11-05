import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET || 'barberflow-super-secret-key-change-in-production-min-32-chars';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'barberflow-refresh-secret-key-change-in-production-min-32-chars';

const registerSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// In-memory store (replace with Prisma in production)
const users = new Map();

const superAdminEmail = 'jorgericardosalgado@gmail.com';
const superAdminPassword = 'jorge0609';

async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

function generateTokens(user: { id: string; email: string; role: string; barbershopId?: string }) {
  const accessToken = jwt.sign(
    { id: user.id, email: user.email, role: user.role, barbershopId: user.barbershopId },
    JWT_SECRET,
    { expiresIn: '15m' }
  );
  const refreshToken = jwt.sign(
    { id: user.id, email: user.email, role: user.role, barbershopId: user.barbershopId },
    JWT_REFRESH_SECRET,
    { expiresIn: '7d' }
  );
  return { accessToken, refreshToken };
}

router.post('/register', async (req, res) => {
  try {
    const data = registerSchema.parse(req.body);

    if (users.has(data.email)) {
      return res.status(400).json({ error: 'Email já cadastrado' });
    }

    const passwordHash = await hashPassword(data.password);
    const isSuperAdmin = data.email === superAdminEmail && data.password === superAdminPassword;

    const user = {
      id: crypto.randomUUID(),
      name: data.name,
      email: data.email,
      passwordHash,
      role: isSuperAdmin ? 'SUPER_ADMIN' : 'ADMIN',
      barbershopId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    users.set(data.email, user);

    const { accessToken, refreshToken } = generateTokens(user);

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });
    res.cookie('accessToken', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 15 * 60 * 1000
    });

    res.status(201).json({
      user: { id: user.id, name: user.name, email: user.email, role: user.role, barbershopId: user.barbershopId },
      token: accessToken,
    });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    res.status(500).json({ error: 'Erro ao criar conta' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const data = loginSchema.parse(req.body);
    const user = users.get(data.email);

    if (!user || !(await verifyPassword(data.password, user.passwordHash))) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    const { accessToken, refreshToken } = generateTokens(user);

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });
    res.cookie('accessToken', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 15 * 60 * 1000
    });

    res.json({
      user: { id: user.id, name: user.name, email: user.email, role: user.role, barbershopId: user.barbershopId },
      token: accessToken,
    });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    res.status(500).json({ error: 'Erro ao fazer login' });
  }
});

router.post('/refresh', (req, res) => {
  const refreshToken = req.cookies?.refreshToken;
  if (!refreshToken) return res.status(401).json({ error: 'Refresh token não fornecido' });

  try {
    const payload = jwt.verify(refreshToken, JWT_REFRESH_SECRET) as { id: string; email: string; role: string; barbershopId?: string };
    const user = users.get(payload.email);
    if (!user) return res.status(401).json({ error: 'Usuário não encontrado' });

    const { accessToken, refreshToken: newRefreshToken } = generateTokens(user);

    res.cookie('refreshToken', newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });
    res.cookie('accessToken', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 15 * 60 * 1000
    });

    res.json({ token: accessToken });
  } catch {
    res.status(401).json({ error: 'Refresh token inválido' });
  }
});

router.post('/logout', (_, res) => {
  res.clearCookie('refreshToken');
  res.clearCookie('accessToken');
  res.json({ message: 'Logout realizado' });
});

router.get('/me', (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : req.cookies?.accessToken;

  if (!token) return res.status(401).json({ error: 'Token não fornecido' });

  try {
    const payload = jwt.verify(token, JWT_SECRET) as { id: string; email: string; role: string; barbershopId?: string };
    const user = users.get(payload.email);
    if (!user) return res.status(401).json({ error: 'Usuário não encontrado' });

    res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role, barbershopId: user.barbershopId } });
  } catch {
    res.status(401).json({ error: 'Token inválido' });
  }
});

// Impersonation endpoint for superadmin
router.post('/impersonate', (req, res) => {
  const { barbershopId } = req.body;
  const user = (req as any).user;

  if (user?.role !== 'SUPER_ADMIN') {
    return res.status(403).json({ error: 'Apenas Super Admin' });
  }

  // In production, fetch barbershop and create impersonation token
  const impersonationToken = jwt.sign(
    { id: user.id, email: user.email, role: 'ADMIN', barbershopId, impersonated: true },
    JWT_SECRET,
    { expiresIn: '1h' }
  );

  res.json({ token: impersonationToken, barbershopId });
});

export default router;