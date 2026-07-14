// Autenticación JWT. Quién puede hacer qué se decide en permissions.js.
import jwt from 'jsonwebtoken';
import { one, verifyPassword } from './db.js';
import { isAtLeast } from './permissions.js';

// En producción definir CGRM_JWT_SECRET en el entorno.
export const JWT_SECRET = process.env.CGRM_JWT_SECRET || 'cgrm-dev-secret-cambiar';

export async function login(username, password) {
  const user = await one('SELECT * FROM users WHERE username = $1 AND active', [username]);
  if (!user || !verifyPassword(password, user.password_hash)) return null;
  const token = jwt.sign(
    { sub: user.id, role: user.role, area: user.area, name: user.name },
    JWT_SECRET,
    { expiresIn: '12h' }
  );
  return { token, user: publicUser(user) };
}

export function publicUser(u) {
  return { id: u.id, username: u.username, name: u.name, role: u.role, area: u.area ?? null, active: u.active };
}

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Token requerido' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = { id: payload.sub, role: payload.role, area: payload.area ?? null, name: payload.name };
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido o caducado' });
  }
}

// Exige un rol mínimo en la jerarquía (empleado < lider < jefe < admin).
export function requireRank(role) {
  return (req, res, next) => {
    if (!isAtLeast(req.user, role)) {
      return res.status(403).json({ error: 'Sin permiso para esta operación' });
    }
    next();
  };
}

// Deniega con el mismo mensaje que el resto de la API.
export const deny = (res, msg = 'Sin permiso para esta operación') => res.status(403).json({ error: msg });
