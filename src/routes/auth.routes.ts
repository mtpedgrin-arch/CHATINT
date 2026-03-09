import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { dataService } from '../services/data.service';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'casino463-secret-key-2024';

// POST /api/auth/login
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, usuario, password } = req.body;
    const loginId = email || usuario;
    if (!loginId || !password) {
      return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
    }

    // Search by email or username
    let user = dataService.getUserByEmail(loginId);
    if (!user) {
      const allUsers = dataService.getUsers();
      user = allUsers.find(u => u.usuario === loginId) || undefined;
    }
    if (!user) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    if (user.estatus !== 'active') {
      return res.status(403).json({ error: 'Usuario inactivo' });
    }

    // Check schedule restrictions
    if (user.inicio && user.fin) {
      const now = new Date();
      const [startH, startM] = user.inicio.split(':').map(Number);
      const [endH, endM] = user.fin.split(':').map(Number);
      const currentMinutes = now.getHours() * 60 + now.getMinutes();
      const startMinutes = startH * 60 + startM;
      const endMinutes = endH * 60 + endM;

      if (currentMinutes < startMinutes || currentMinutes > endMinutes) {
        return res.status(403).json({ error: `Acceso restringido. Horario permitido: ${user.inicio} - ${user.fin}` });
      }
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, rol: user.rol, nombre: user.nombre },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        nombre: user.nombre,
        apellido: user.apellido,
        email: user.email,
        rol: user.rol,
        usuario: user.usuario,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// GET /api/auth/me
router.get('/me', (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'No token' });

  try {
    const token = authHeader.replace('Bearer ', '');
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    const user = dataService.getUserById(decoded.id);
    if (!user) return res.status(401).json({ error: 'Usuario no encontrado' });

    res.json({
      id: user.id,
      nombre: user.nombre,
      apellido: user.apellido,
      email: user.email,
      rol: user.rol,
      usuario: user.usuario,
    });
  } catch {
    res.status(401).json({ error: 'Token inválido' });
  }
});

// GET /api/auth/check-schedule
router.get('/check-schedule', (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'No token' });

  try {
    const token = authHeader.replace('Bearer ', '');
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    const user = dataService.getUserById(decoded.id);
    if (!user) return res.status(401).json({ error: 'Usuario no encontrado' });

    res.json({ allowed: true, restriccion: user.restriccion });
  } catch {
    res.status(401).json({ error: 'Token inválido' });
  }
});

// GET /api/auth/get-role-id
router.get('/get-role-id', (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'No token' });

  try {
    const token = authHeader.replace('Bearer ', '');
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    res.json({ rol: decoded.rol, id: decoded.id });
  } catch {
    res.status(401).json({ error: 'Token inválido' });
  }
});

export default router;
