// Autenticación JWT. Quién puede hacer qué se decide en permissions.js.
import jwt from 'jsonwebtoken';
import { one, verifyPassword } from './db.js';
import { isAtLeast } from './permissions.js';

// En producción definir CGRM_JWT_SECRET en el entorno. Sin él, cualquiera podría
// forjar un token válido con el secreto por defecto conocido: el arranque aborta.
if (process.env.NODE_ENV === 'production' && !process.env.CGRM_JWT_SECRET) {
  console.error('Falta CGRM_JWT_SECRET en producción. Defínelo en el entorno antes de arrancar.');
  process.exit(1);
}
export const JWT_SECRET = process.env.CGRM_JWT_SECRET || 'cgrm-dev-secret-cambiar';

export function issueToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, area: user.area, name: user.name },
    JWT_SECRET,
    { expiresIn: '12h' }
  );
}

export async function login(username, password) {
  const user = await one('SELECT * FROM users WHERE username = $1 AND active', [username]);
  if (!user || !verifyPassword(password, user.password_hash)) return null;
  return { token: issueToken(user), user: publicUser(user) };
}

export function publicUser(u) {
  return { id: u.id, username: u.username, name: u.name, role: u.role, area: u.area ?? null, active: u.active };
}

// Async: relee el usuario de la base en cada petición en vez de fiarse de los claims
// del token. Sin esto, degradar o desactivar a alguien no surtía efecto hasta que su
// token de 12h caducase por su cuenta.
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Token requerido' });
  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Token inválido o caducado' });
  }
  one('SELECT id, role, area, name, active FROM users WHERE id = $1', [payload.sub])
    .then((u) => {
      if (!u || !u.active) return res.status(401).json({ error: 'Sesión no válida' });
      req.user = { id: u.id, role: u.role, area: u.area ?? null, name: u.name };
      next();
    })
    .catch(next);
}

// Exige un rol mínimo en la jerarquía (empleado < jefe < admin).
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
