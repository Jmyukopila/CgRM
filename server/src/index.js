// API de operaciones de Casa Gracia.
import express from 'express';
import cors from 'cors';
import { all, one, exec, hashPassword } from './db.js';
import { login, issueToken, publicUser, requireAuth, requireRank, deny } from './auth.js';
import { notifyUsers } from './push.js';
import {
  AREAS, ROLES, TASK_TYPES, AREA_OF_TYPE,
  isAtLeast, seesAllAreas, inArea,
  canWorkTask, canSupervise, canReviewTask, canAttachEvidence,
  canManageUsers, canGrantRole, canManageOps,
  ROOM_FLOW, canSetRoomStatus, canManageStays,
} from './permissions.js';
import * as storage from './storage.js';

const app = express();
app.use(cors());

// Las evidencias (fotos y vídeos) NO pasan por aquí: la app las sube con una URL
// firmada directamente al object storage. Este límite solo cubre las fotos en base64
// de incidencias y objetos perdidos, que son anteriores a ese mecanismo.
app.use(express.json({ limit: '8mb' }));

// Sonda de salud sin autenticar: la usa el keepalive de GitHub Actions para
// mantener despierto el servicio de Render durante el horario operativo y evitar
// el cold-start de ~30-50s en el primer login del turno.
app.get('/healthz', (_req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 4000;

// --- Helpers ----------------------------------------------------------------

// Plazo automático por prioridad: pasado sin completar, el barrido periódico
// marca la tarea como 'vencida' sin que nadie tenga que tocarla a mano.
const TASK_SLA_HOURS = { urgente: 4, alta: 24, media: 48, baja: 96 };
const VALID_PRIORITIES = Object.keys(TASK_SLA_HOURS);

// Zona horaria del hotel: todo el cálculo de "día/hora local" para tareas programadas
// se hace en Postgres con esta zona, nunca con la hora del proceso Node.
const HOTEL_TZ = 'America/Bogota';

// Barre tareas abiertas cuyo plazo ya pasó y las marca 'vencida'. Se llama al
// arrancar, cada pocos minutos en segundo plano, y de forma perezosa antes de
// servir listados para que quien mira el tablón vea el estado ya actualizado.
async function sweepExpiredTasks() {
  // Si la limpieza que dejó la habitación en 'en_limpieza' vence sin terminar, la
  // habitación se queda huérfana en ese estado para siempre si nadie la recalcula
  // (el barrido solo tocaba la tarea). Aquí se marca 'sucia' salvo que otra limpieza
  // siga en curso sobre la misma habitación o esté bloqueada por una incidencia.
  await exec(
    `WITH expired AS (
       SELECT id, room_id, type, status AS prev_status FROM tasks
       WHERE status = ANY($1) AND due_at IS NOT NULL AND due_at < now()
     ),
     marked AS (
       UPDATE tasks SET status = 'vencida', expired_at = now()
       WHERE id IN (SELECT id FROM expired)
     ),
     task_audit AS (
       INSERT INTO audit_log (entity, entity_id, action, from_value, to_value)
       SELECT 'task', id, 'status', prev_status, 'vencida' FROM expired
     ),
     room_reset AS (
       UPDATE rooms r SET status = 'sucia'
       FROM expired e
       WHERE r.id = e.room_id AND e.type = 'limpieza' AND e.prev_status = 'en_curso'
         AND r.status = 'en_limpieza'
         AND NOT EXISTS (
           SELECT 1 FROM tasks t2
           WHERE t2.room_id = r.id AND t2.type = 'limpieza' AND t2.status = 'en_curso'
             AND t2.id NOT IN (SELECT id FROM expired)
         )
       RETURNING r.id
     )
     INSERT INTO audit_log (entity, entity_id, action, from_value, to_value)
     SELECT 'room', id, 'status', 'en_limpieza', 'sucia' FROM room_reset`,
    [EXPIRABLE_STATUSES]
  );
}

// Materializa en tasks reales las programaciones (task_schedules) cuya hora local ya
// llegó hoy y que aún no tienen instancia para ese slot exacto. Se llama al arrancar
// y cada pocos minutos, igual que sweepExpiredTasks; NO de forma perezosa por
// petición (crear tareas es más caro que un UPDATE y unos minutos de demora no
// importan aquí). La idempotencia real la da el índice único parcial de
// tasks(schedule_id, scheduled_slot) + ON CONFLICT DO NOTHING en createTask: el
// NOT EXISTS de abajo solo evita trabajo repetido, no es la garantía.
async function runTaskSchedules() {
  const due = await all(
    `WITH local AS (
       SELECT (now() AT TIME ZONE $1)::date AS today,
              extract(hour FROM now() AT TIME ZONE $1)::int AS hour
     )
     SELECT s.*, h.run_hour,
            ((l.today + make_interval(hours => h.run_hour))::timestamp AT TIME ZONE $1) AS slot_at
     FROM task_schedules s
     CROSS JOIN local l
     CROSS JOIN LATERAL unnest(s.run_hours) AS h(run_hour)
     WHERE s.active
       AND l.today >= s.date_from
       AND (s.freq = 'una_vez' OR s.date_to IS NULL OR l.today <= s.date_to)
       AND h.run_hour <= l.hour
       AND (
         s.freq = 'diaria'
         OR (s.freq = 'semanal' AND (
              (s.week_days IS NOT NULL AND extract(dow FROM l.today)::int = ANY(s.week_days))
           OR (s.week_days IS NULL AND extract(dow FROM l.today) = extract(dow FROM s.date_from))
         ))
         -- Mensual anclada a un día 29-31: en meses cortos se clampa al último día del mes,
         -- si no, esa programación nunca dispararía en febrero (u otro mes corto).
         OR (s.freq = 'mensual' AND extract(day FROM l.today)::int = LEAST(
              extract(day FROM s.date_from)::int,
              extract(day FROM (date_trunc('month', l.today) + interval '1 month - 1 day'))::int
            ))
         OR (s.freq = 'una_vez' AND l.today = s.date_from)
       )
       AND NOT EXISTS (
         SELECT 1 FROM tasks t
         WHERE t.schedule_id = s.id
           AND t.scheduled_slot = ((l.today + make_interval(hours => h.run_hour))::timestamp AT TIME ZONE $1)
       )
     ORDER BY s.id, h.run_hour`,
    [HOTEL_TZ]
  );

  for (const s of due) {
    const room = await getRoom(s.room_id);
    if (!room) continue;
    const taskId = await createTask({
      room, area: s.area, type: s.type, title: s.title, description: s.description,
      priority: s.priority, assignee_id: s.assignee_id, createdBy: s.created_by,
      scheduleId: s.id, scheduledSlot: s.slot_at,
      dueAt: s.freq === 'una_vez' && s.date_to ? { endOfLocalDay: s.date_to } : null,
    });
    // Una programación 'una_vez' solo produce una instancia; hecha, se autodesactiva.
    if (taskId && s.freq === 'una_vez') {
      await exec('UPDATE task_schedules SET active = false WHERE id = $1', [s.id]);
    }
  }
}

// Express 4 no captura el rechazo de un handler async: sin esto, un error de la
// base dejaría la petición colgada en vez de responder 500.
const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Postgres rechaza un id no numérico con un error de tipo; lo tratamos como "no existe".
function toId(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function getRoom(id) {
  return one('SELECT * FROM rooms WHERE id = $1', [id]);
}

// Historial append-only: quién cambió qué y cuándo. actorId null = lo hizo el sistema
// (barrido de vencimiento, generador de programaciones).
function recordAudit({ entity, entityId, action, from = null, to = null, note = '', actorId = null }) {
  return exec(
    `INSERT INTO audit_log (entity, entity_id, action, from_value, to_value, note, actor_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [entity, entityId, action, from, to, note, actorId]
  );
}

// Recibe la habitación completa (no solo el id) para poder registrar el "from" en el
// historial y evitar una escritura/auditoría de más si el estado no cambia de verdad.
async function setRoomStatus(room, status, actorId = null) {
  if (room.status === status) return;
  await exec('UPDATE rooms SET status = $1 WHERE id = $2', [status, room.id]);
  await recordAudit({ entity: 'room', entityId: room.id, action: 'status', from: room.status, to: status, actorId });
  room.status = status;
}

async function getTaskFull(id) {
  const task = await one(
    `SELECT t.*, r.name AS room_name, r.floor AS room_floor, r.type AS room_type,
            u.name AS assignee_name, c.name AS created_by_name, v.name AS reviewed_by_name
     FROM tasks t
     JOIN rooms r ON r.id = t.room_id
     LEFT JOIN users u ON u.id = t.assignee_id
     JOIN users c ON c.id = t.created_by
     LEFT JOIN users v ON v.id = t.reviewed_by
     WHERE t.id = $1`,
    [id]
  );
  if (!task) return null;
  task.items = await all(
    `SELECT i.id, i.text, i.done, i.position, i.requires_evidence, i.evidence_kind, i.min_evidence,
            (SELECT COUNT(*)::int FROM evidence e WHERE e.task_item_id = i.id
               AND (i.evidence_kind = 'cualquiera' OR e.kind = i.evidence_kind)) AS evidence_count
     FROM task_items i WHERE i.task_id = $1 ORDER BY i.position`,
    [id]
  );
  return task;
}

// Puntos que exigen evidencia y todavía no la tienen: la tarea no se puede cerrar
// mientras quede alguno.
function pendingEvidence(taskId) {
  return all(
    `SELECT i.id, i.text, i.min_evidence,
            (SELECT COUNT(*)::int FROM evidence e WHERE e.task_item_id = i.id
               AND (i.evidence_kind = 'cualquiera' OR e.kind = i.evidence_kind)) AS evidence_count
     FROM task_items i
     WHERE i.task_id = $1 AND i.requires_evidence
       AND (SELECT COUNT(*) FROM evidence e WHERE e.task_item_id = i.id
              AND (i.evidence_kind = 'cualquiera' OR e.kind = i.evidence_kind)) < i.min_evidence
     ORDER BY i.position`,
    [taskId]
  );
}

// --- Auth -------------------------------------------------------------------

// Rate-limit de intentos fallidos por IP+usuario: sin él, el login era vulnerable a
// fuerza bruta (sin dependencia nueva; instancia única, así que un Map en memoria basta).
const LOGIN_ATTEMPTS = new Map();
const LOGIN_MAX_FAILS = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

app.post('/api/auth/login', h(async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Usuario y contraseña requeridos' });

  const key = `${req.ip}|${username.trim().toLowerCase()}`;
  const attempt = LOGIN_ATTEMPTS.get(key);
  if (attempt && attempt.count >= LOGIN_MAX_FAILS && Date.now() - attempt.since < LOGIN_WINDOW_MS) {
    return res.status(429).json({ error: 'Demasiados intentos, espera unos minutos' });
  }

  const result = await login(username.trim().toLowerCase(), password);
  if (!result) {
    const next = attempt && Date.now() - attempt.since < LOGIN_WINDOW_MS
      ? { count: attempt.count + 1, since: attempt.since }
      : { count: 1, since: Date.now() };
    LOGIN_ATTEMPTS.set(key, next);
    return res.status(401).json({ error: 'Credenciales incorrectas' });
  }
  LOGIN_ATTEMPTS.delete(key);
  res.json(result);
}));

// Autorregistro: público a propósito, pero SIEMPRE crea un empleado. Un jefe o
// admin se da de alta a mano en la base (o desde /api/users, ya autenticado como
// jefe/admin) — este endpoint no acepta rol, para que nadie pueda fabricarse
// permisos de mando con solo llenar un formulario.
app.post('/api/auth/register', h(async (req, res) => {
  const { username, password, name, area } = req.body || {};
  if (!username?.trim() || !password || !name?.trim()) {
    return res.status(400).json({ error: 'Usuario, contraseña y nombre son obligatorios' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
  }
  if (!AREAS.includes(area)) {
    return res.status(400).json({ error: 'Selecciona un área válida' });
  }

  const cleanUsername = username.trim().toLowerCase();
  const exists = await one('SELECT id FROM users WHERE username = $1', [cleanUsername]);
  if (exists) return res.status(400).json({ error: 'Ese usuario ya existe' });

  const user = await one(
    `INSERT INTO users (username, password_hash, name, role, area)
     VALUES ($1, $2, $3, 'empleado', $4) RETURNING *`,
    [cleanUsername, hashPassword(password), name.trim(), area]
  );
  res.status(201).json({ token: issueToken(user), user: publicUser(user) });
}));

// --- Subida local de evidencias (solo driver `local`, desarrollo) ---------------
// Va antes del requireAuth de /api porque la app sube con la firma de la URL, no con
// el JWT (es el mismo contrato que una URL firmada de Supabase).

if (storage.DRIVER === 'local') {
  app.put(
    '/uploads/*',
    express.raw({ type: '*/*', limit: '120mb' }),
    h(async (req, res) => {
      const storagePath = req.params[0];
      if (!storage.verifyLocalSignature(storagePath, req.query.sig)) {
        return res.status(403).json({ error: 'Firma de subida no válida' });
      }
      await storage.writeLocal(storagePath, req.body);
      res.status(200).json({ ok: true });
    })
  );
  app.use('/uploads', express.static(storage.UPLOAD_DIR));
}

app.use('/api', requireAuth);

app.get('/api/me', h(async (req, res) => {
  const user = await one('SELECT * FROM users WHERE id = $1', [req.user.id]);
  res.json(publicUser(user));
}));

// --- Notificaciones push ------------------------------------------------------

app.post('/api/push-tokens', h(async (req, res) => {
  const { token } = req.body || {};
  if (!token) return res.status(400).json({ error: 'Falta el token' });
  await exec('DELETE FROM push_tokens WHERE token = $1', [token]);
  await exec('INSERT INTO push_tokens (user_id, token) VALUES ($1, $2)', [req.user.id, token]);
  res.status(201).json({ ok: true });
}));

// --- Personal -----------------------------------------------------------------

// El empleado no ve la plantilla; jefe y admin ven a todo el mundo.
app.get('/api/users', requireRank('jefe'), h(async (req, res) => {
  // Solo quien da de alta/reactiva personal necesita ver a quien está desactivado.
  const activeFilter = req.query.include_inactive === '1' && canManageUsers(req.user) ? '' : 'AND active';
  const users = seesAllAreas(req.user)
    ? await all(`SELECT * FROM users WHERE true ${activeFilter} ORDER BY area NULLS FIRST, name`)
    : await all(`SELECT * FROM users WHERE area = $1 ${activeFilter} ORDER BY name`, [req.user.area]);
  res.json(users.map(publicUser));
}));

function validateUserRoleArea(actor, role, area) {
  if (!ROLES.includes(role)) return 'Rol no válido';
  if (!canGrantRole(actor, role)) return 'No puedes otorgar ese rol';
  if (role === 'empleado') {
    if (!AREAS.includes(area)) return 'Un empleado necesita un área válida';
  }
  return null;
}

app.post('/api/users', h(async (req, res) => {
  if (!canManageUsers(req.user)) return deny(res);
  const { username, password, name, role, area = null } = req.body || {};
  if (!username?.trim() || !password || !name?.trim()) {
    return res.status(400).json({ error: 'Usuario, contraseña y nombre son obligatorios' });
  }
  const invalid = validateUserRoleArea(req.user, role, area);
  if (invalid) return res.status(400).json({ error: invalid });

  const exists = await one('SELECT id FROM users WHERE username = $1', [username.trim().toLowerCase()]);
  if (exists) return res.status(400).json({ error: 'Ese usuario ya existe' });

  const user = await one(
    'INSERT INTO users (username, password_hash, name, role, area) VALUES ($1, $2, $3, $4, $5) RETURNING *',
    [
      username.trim().toLowerCase(), hashPassword(password), name.trim(), role,
      role === 'empleado' ? area : null,
    ]
  );
  res.status(201).json(publicUser(user));
}));

app.patch('/api/users/:id', h(async (req, res) => {
  if (!canManageUsers(req.user)) return deny(res);
  const id = toId(req.params.id);
  const user = id && (await one('SELECT * FROM users WHERE id = $1', [id]));
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  // Un jefe no puede degradar ni reescribir a un admin.
  if (!canGrantRole(req.user, user.role)) return deny(res, 'No puedes editar a este usuario');

  const { name, role, area, active, password } = req.body || {};
  const nextRole = role ?? user.role;
  const nextArea = area !== undefined ? area : user.area;
  if (role !== undefined || area !== undefined) {
    const invalid = validateUserRoleArea(req.user, nextRole, nextArea);
    if (invalid) return res.status(400).json({ error: invalid });
    await exec('UPDATE users SET role = $1, area = $2 WHERE id = $3', [
      nextRole,
      nextRole === 'empleado' ? nextArea : null,
      user.id,
    ]);
  }
  if (name !== undefined) await exec('UPDATE users SET name = $1 WHERE id = $2', [String(name).trim(), user.id]);
  if (active !== undefined) await exec('UPDATE users SET active = $1 WHERE id = $2', [!!active, user.id]);
  if (password) {
    await exec('UPDATE users SET password_hash = $1 WHERE id = $2', [hashPassword(password), user.id]);
  }
  res.json(publicUser(await one('SELECT * FROM users WHERE id = $1', [user.id])));
}));

// --- Habitaciones -----------------------------------------------------------

app.get('/api/rooms', h(async (_req, res) => {
  await sweepExpiredTasks();
  const rooms = await all(
    `SELECT r.*,
      (SELECT COUNT(*) FROM tasks t WHERE t.room_id = r.id
         AND t.status = ANY($1))::int AS open_tasks,
      (SELECT COUNT(*) FROM incidents i WHERE i.room_id = r.id
         AND i.status != 'resuelta')::int AS open_incidents,
      s.id AS stay_id, s.guest_name, s.expected_checkout
     FROM rooms r
     LEFT JOIN room_stays s ON s.room_id = r.id AND s.checkout_at IS NULL
     ORDER BY r.floor, r.name`,
    [OPEN_TASK_STATUSES]
  );
  res.json(rooms);
}));

// El estado de trabajo (limpieza/inspección) lo deriva el flujo de tareas (ver PATCH
// /api/tasks/:id); este endpoint cubre las transiciones manuales del tablero de
// housekeeping y las notas. 'ocupada' está fuera de aquí: solo entra/sale por
// check-in/check-out.
app.patch('/api/rooms/:id', h(async (req, res) => {
  const id = toId(req.params.id);
  const room = id && (await getRoom(id));
  if (!room) return res.status(404).json({ error: 'Habitación no encontrada' });
  const { notes, status } = req.body || {};

  if (notes !== undefined) {
    if (!isAtLeast(req.user, 'jefe')) return deny(res, 'Solo un mando puede editar las notas');
    await exec('UPDATE rooms SET notes = $1 WHERE id = $2', [String(notes), room.id]);
  }
  if (status !== undefined) {
    if (status === 'ocupada' || room.status === 'ocupada') {
      return res.status(400).json({ error: 'El estado ocupada solo cambia con check-in/check-out' });
    }
    if (!ROOM_FLOW[room.status]?.includes(status)) {
      return res.status(400).json({ error: `No se puede pasar de ${room.status} a ${status}` });
    }
    if (!canSetRoomStatus(req.user, room, status)) return deny(res, 'No puedes hacer ese cambio de estado');
    await setRoomStatus(room, status, req.user.id);
  }
  res.json(await getRoom(room.id));
}));

// --- Ocupación / estancias ------------------------------------------------------

app.get('/api/rooms/:id/stays', h(async (req, res) => {
  if (!canManageStays(req.user) && !isAtLeast(req.user, 'jefe')) return deny(res);
  const id = toId(req.params.id);
  const room = id && (await getRoom(id));
  if (!room) return res.status(404).json({ error: 'Habitación no encontrada' });
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  const rows = await all(
    `SELECT s.*, ci.name AS checked_in_by_name, co.name AS checked_out_by_name
     FROM room_stays s
     JOIN users ci ON ci.id = s.checked_in_by
     LEFT JOIN users co ON co.id = s.checked_out_by
     WHERE s.room_id = $1
     ORDER BY s.checkin_at DESC
     LIMIT $2`,
    [room.id, limit]
  );
  res.json(rows);
}));

app.post('/api/rooms/:id/checkin', h(async (req, res) => {
  if (!canManageStays(req.user)) return deny(res, 'Solo recepción o dirección puede hacer check-in');
  const id = toId(req.params.id);
  const room = id && (await getRoom(id));
  if (!room) return res.status(404).json({ error: 'Habitación no encontrada' });
  if (room.status === 'bloqueada') return res.status(400).json({ error: 'La habitación está bloqueada' });
  if (room.status === 'ocupada') return res.status(409).json({ error: 'Ya hay una estancia activa en esta habitación' });

  const { guest_name = '', expected_checkout = null, notes = '' } = req.body || {};
  if (expected_checkout && !DATE_RE.test(expected_checkout)) {
    return res.status(400).json({ error: 'Fecha de salida no válida (AAAA-MM-DD)' });
  }
  const stay = await one(
    `INSERT INTO room_stays (room_id, guest_name, notes, expected_checkout, checked_in_by)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [room.id, String(guest_name).trim(), String(notes).trim(), expected_checkout, req.user.id]
  );
  await setRoomStatus(room, 'ocupada', req.user.id);
  await recordAudit({ entity: 'room', entityId: room.id, action: 'checkin', to: stay.guest_name || null, actorId: req.user.id });
  res.status(201).json({ stay, room: await getRoom(room.id) });
}));

app.post('/api/rooms/:id/checkout', h(async (req, res) => {
  if (!canManageStays(req.user)) return deny(res, 'Solo recepción o dirección puede hacer check-out');
  const id = toId(req.params.id);
  const room = id && (await getRoom(id));
  if (!room) return res.status(404).json({ error: 'Habitación no encontrada' });
  const stay = await one(
    'SELECT * FROM room_stays WHERE room_id = $1 AND checkout_at IS NULL', [room.id]
  );
  if (!stay) return res.status(400).json({ error: 'No hay una estancia activa en esta habitación' });

  const { notes = '' } = req.body || {};
  await exec(
    `UPDATE room_stays SET checkout_at = now(), checked_out_by = $1,
       notes = CASE WHEN $2 = '' THEN notes ELSE notes || E'\\n' || $2 END WHERE id = $3`,
    [req.user.id, String(notes).trim(), stay.id]
  );
  await setRoomStatus(room, 'sucia', req.user.id);
  await recordAudit({ entity: 'room', entityId: room.id, action: 'checkout', from: stay.guest_name || null, actorId: req.user.id });

  // Turnover: la salida genera sola la orden de limpieza con la checklist de la
  // habitación, sin asignar (la coge el equipo), prioridad alta.
  const taskId = await createTask({
    room, area: 'limpieza', type: 'limpieza',
    title: `Limpieza de salida · ${room.name}`,
    description: '', priority: 'alta', assignee_id: null, createdBy: req.user.id,
  });
  const leads = (
    await all(`SELECT id FROM users WHERE active AND role IN ('jefe','admin')`)
  ).map((u) => u.id);
  await notifyUsers(leads, {
    type: 'checkout', title: 'Salida registrada', body: `${room.name}: limpieza de salida generada`,
    ref: { type: 'task', id: taskId },
  });

  res.json({ stay: await one('SELECT * FROM room_stays WHERE id = $1', [stay.id]), room: await getRoom(room.id), task_id: taskId });
}));

// --- Tareas -----------------------------------------------------------------

app.get('/api/tasks', h(async (req, res) => {
  await sweepExpiredTasks();
  const clauses = [];
  const params = [];

  // Un empleado solo ve el tablón de su área. Jefe y admin lo ven todo.
  if (!seesAllAreas(req.user)) {
    clauses.push(`t.area = $${params.push(req.user.area)}`);
  } else if (req.query.area && AREAS.includes(req.query.area)) {
    clauses.push(`t.area = $${params.push(req.query.area)}`);
  }

  if (req.query.mine === '1') {
    const p = params.push(req.user.id);
    // "Mías" incluye lo que está sin coger de mi área: es trabajo que me toca a mí.
    clauses.push(seesAllAreas(req.user)
      ? `t.assignee_id = $${p}`
      : `(t.assignee_id = $${p} OR t.assignee_id IS NULL)`);
  }
  if (req.query.room_id) {
    clauses.push(`t.room_id = $${params.push(toId(req.query.room_id))}`);
  }
  if (req.query.status === 'abiertas') {
    clauses.push(`t.status = ANY($${params.push(OPEN_TASK_STATUSES)})`);
  } else if (req.query.status === 'revision') {
    clauses.push(`t.status = 'hecha'`);
  } else if (req.query.status) {
    clauses.push(`t.status = $${params.push(req.query.status)}`);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const tasks = await all(
    `SELECT t.*, r.name AS room_name, r.floor AS room_floor, u.name AS assignee_name,
      (SELECT COUNT(*) FROM task_items i WHERE i.task_id = t.id)::int AS total_items,
      (SELECT COUNT(*) FROM task_items i WHERE i.task_id = t.id AND i.done)::int AS done_items,
      (SELECT COUNT(*) FROM evidence e WHERE e.task_id = t.id)::int AS evidence_count
     FROM tasks t
     JOIN rooms r ON r.id = t.room_id
     LEFT JOIN users u ON u.id = t.assignee_id
     ${where}
     ORDER BY CASE t.status
                WHEN 'vencida' THEN 0 WHEN 'impugnada' THEN 0 WHEN 'rechazada' THEN 0 WHEN 'en_curso' THEN 1
                WHEN 'hecha' THEN 2 WHEN 'pendiente' THEN 3 ELSE 4 END,
              CASE t.priority WHEN 'urgente' THEN 0 WHEN 'alta' THEN 1 WHEN 'media' THEN 2 ELSE 3 END,
              t.created_at DESC`,
    params
  );
  res.json(tasks);
}));

app.get('/api/tasks/:id', h(async (req, res) => {
  const id = toId(req.params.id);
  const task = id && (await getTaskFull(id));
  if (!task) return res.status(404).json({ error: 'Tarea no encontrada' });
  if (!inArea(req.user, task.area)) return deny(res, 'Esta tarea es de otra área');
  res.json(task);
}));

const TASK_TITLES = {
  limpieza: 'Limpieza', mantenimiento: 'Mantenimiento', inspeccion: 'Inspección',
  recepcion: 'Recepción', cocina: 'Cocina', lavanderia: 'Lavandería', general: 'Tarea',
};

// scheduleId/scheduledSlot: solo los pone el generador de programaciones (ver
// runTaskSchedules); el INSERT las ignora en la creación manual (quedan NULL).
// dueAt.endOfLocalDay: plazo fijo (fin de ese día en la zona del hotel) en vez del
// SLA por prioridad — lo usa una programación 'una_vez' con date_to.
const EVIDENCE_KINDS = ['foto', 'video', 'cualquiera'];
const MAX_CHECKLIST_ITEMS = 60;

// Saneado de una checklist que llega del cliente (crear tarea con puntos a medida, o
// reescribir la checklist de una habitación). Devuelve null si no venía ninguna —
// que es distinto de venir vacía: vacía significa "esta tarea no lleva checklist".
function normalizeChecklist(items) {
  if (!Array.isArray(items)) return null;
  const out = [];
  for (const raw of items.slice(0, MAX_CHECKLIST_ITEMS)) {
    const text = String(raw?.text ?? '').trim().slice(0, 200);
    if (!text) continue;
    const min = Number(raw?.min_evidence);
    out.push({
      text,
      position: out.length,
      requires_evidence: !!raw?.requires_evidence,
      evidence_kind: EVIDENCE_KINDS.includes(raw?.evidence_kind) ? raw.evidence_kind : 'cualquiera',
      min_evidence: Number.isInteger(min) && min >= 1 ? Math.min(min, 10) : 1,
    });
  }
  return out;
}

async function insertChecklistItems(taskId, items) {
  for (const it of items) {
    await exec(
      `INSERT INTO task_items (task_id, text, position, requires_evidence, evidence_kind, min_evidence)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [taskId, it.text, it.position, it.requires_evidence, it.evidence_kind, it.min_evidence]
    );
  }
}

// Reescribe la checklist propia de una habitación para un tipo de trabajo. No toca las
// tareas ya creadas: cada una se llevó su copia y se cierra con lo que se le exigió.
async function setRoomChecklist(roomId, taskType, items) {
  await exec('DELETE FROM room_checklist_items WHERE room_id = $1 AND task_type = $2', [roomId, taskType]);
  for (const it of items) {
    await exec(
      `INSERT INTO room_checklist_items
         (room_id, task_type, text, position, requires_evidence, evidence_kind, min_evidence)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [roomId, taskType, it.text, it.position, it.requires_evidence, it.evidence_kind, it.min_evidence]
    );
  }
}

function getRoomChecklist(roomId, taskType) {
  return all(
    `SELECT id, task_type, text, position, requires_evidence, evidence_kind, min_evidence
     FROM room_checklist_items WHERE room_id = $1 AND task_type = $2 ORDER BY position`,
    [roomId, taskType]
  );
}

async function createTask({
  room, area, type, title, description, priority, assignee_id, incident_id, createdBy,
  scheduleId = null, scheduledSlot = null, dueAt = null, items = null,
}) {
  let dueAtValue = null;
  if (dueAt?.endOfLocalDay) {
    const row = await one(
      `SELECT (($1::date + 1)::timestamp AT TIME ZONE $2) AS due_at`,
      [dueAt.endOfLocalDay, HOTEL_TZ]
    );
    dueAtValue = row.due_at;
  }

  // ON CONFLICT protege el slot de una programación: si dos pasadas del generador
  // solapan (arranque + intervalo, o dos réplicas), la segunda no inserta nada.
  const inserted = await one(
    `INSERT INTO tasks (room_id, area, type, title, description, priority, assignee_id, incident_id, created_by, due_at, schedule_id, scheduled_slot)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, COALESCE($10, now() + ($11 || ' hours')::interval), $12, $13)
     ON CONFLICT (schedule_id, scheduled_slot) WHERE schedule_id IS NOT NULL DO NOTHING
     RETURNING id`,
    [
      room.id, area, type, title || `${TASK_TITLES[type]} · ${room.name}`, description, priority,
      assignee_id, incident_id ?? null, createdBy, dueAtValue, TASK_SLA_HOURS[priority],
      scheduleId, scheduledSlot,
    ]
  );
  if (!inserted) return null;
  const taskId = inserted.id;
  await recordAudit({ entity: 'task', entityId: taskId, action: 'created', to: 'pendiente', actorId: createdBy });

  // La checklist de la tarea, por orden de prioridad:
  //   1. los puntos a medida que venían en la petición (checklist personalizada),
  //   2. la checklist PROPIA de esta habitación para este tipo de trabajo,
  //   3. la plantilla del tipo de habitación, como red de seguridad para una habitación
  //      dada de alta a mano que todavía no tiene checklist propia.
  // Sea cual sea el origen, la tarea se lleva su copia: editar después la checklist de
  // la habitación no altera el trabajo ya repartido.
  if (items) {
    await insertChecklistItems(taskId, items);
  } else {
    const copied = await exec(
      `INSERT INTO task_items (task_id, text, position, requires_evidence, evidence_kind, min_evidence)
       SELECT $1, c.text, c.position, c.requires_evidence, c.evidence_kind, c.min_evidence
       FROM room_checklist_items c
       WHERE c.room_id = $2 AND c.task_type = $3`,
      [taskId, room.id, type]
    );
    if (copied === 0) {
      await exec(
        `INSERT INTO task_items (task_id, text, position, requires_evidence, evidence_kind, min_evidence)
         SELECT $1, i.text, i.position, i.requires_evidence, i.evidence_kind, i.min_evidence
         FROM checklist_template_items i
         JOIN checklist_templates t ON t.id = i.template_id
         WHERE t.room_type = $2 AND t.task_type = $3`,
        [taskId, room.type, type]
      );
    }
  }

  if (assignee_id) {
    await notifyUsers([assignee_id], {
      type: 'task_assigned', title: 'Nueva tarea asignada', body: `${TASK_TITLES[type]} · ${room.name}`,
      ref: { type: 'task', id: taskId },
    });
  }
  return taskId;
}

// Validaciones comunes a crear una tarea directa (POST /api/tasks) o una programación
// (POST /api/task-schedules): tipo, prioridad, área supervisada, habitaciones válidas
// y asignado dentro del área.
async function validateTaskPayload(user, body) {
  const { room_id, room_ids, type, area, priority = 'media', assignee_id = null } = body || {};
  if (!TASK_TYPES.includes(type)) return { error: 'Tipo de tarea no válido', code: 400 };
  if (!VALID_PRIORITIES.includes(priority)) return { error: 'Prioridad no válida', code: 400 };

  const taskArea = area && AREAS.includes(area) ? area : AREA_OF_TYPE[type];
  if (!canSupervise(user, taskArea)) return { error: 'No puedes crear trabajo en esa área', code: 403 };

  const ids = Array.isArray(room_ids) && room_ids.length > 0 ? room_ids : [room_id];
  const rooms = await Promise.all(ids.map((id) => (toId(id) ? getRoom(toId(id)) : null)));
  if (rooms.length === 0 || rooms.some((r) => !r)) return { error: 'Habitación no válida', code: 400 };

  let assigneeId = null;
  if (assignee_id) {
    const assignee = await one('SELECT * FROM users WHERE id = $1 AND active', [toId(assignee_id)]);
    if (!assignee) return { error: 'Persona asignada no válida', code: 400 };
    if (!inArea(assignee, taskArea)) {
      return { error: `${assignee.name} no pertenece al área de ${taskArea}`, code: 400 };
    }
    assigneeId = assignee.id;
  }
  return { taskArea, rooms, assigneeId, priority };
}

// Acepta room_id (una habitación) o room_ids (asignación masiva a varias a la vez).
//
// items: checklist a medida para esta tanda de tareas. Si no viene, cada tarea copia la
//   checklist propia de SU habitación (así una misma orden — "limpieza general" en las 8
//   habitaciones y la piscina — le exige a cada sitio lo que toca en ese sitio).
// save_checklist: además, deja esos puntos como la checklist de esas habitaciones para
//   este tipo de trabajo, de modo que las próximas tareas ya salgan con ellos.
app.post('/api/tasks', requireRank('jefe'), h(async (req, res) => {
  const { type, title, description = '', save_checklist = false } = req.body || {};
  const v = await validateTaskPayload(req.user, req.body || {});
  if (v.error) return res.status(v.code).json({ error: v.error });

  const items = normalizeChecklist(req.body?.items);

  const taskIds = [];
  for (const room of v.rooms) {
    if (items && save_checklist) await setRoomChecklist(room.id, type, items);
    taskIds.push(
      await createTask({
        room, area: v.taskArea, type, title, description, priority: v.priority,
        assignee_id: v.assigneeId, createdBy: req.user.id, items,
      })
    );
  }
  if (taskIds.length === 1) return res.status(201).json(await getTaskFull(taskIds[0]));
  res.status(201).json(await Promise.all(taskIds.map(getTaskFull)));
}));

// La checklist propia de una habitación, agrupada por tipo de trabajo. La ve cualquiera
// (el empleado necesita saber qué se le va a exigir); reescribirla es cosa del mando.
app.get('/api/rooms/:id/checklist', h(async (req, res) => {
  const id = toId(req.params.id);
  const room = id && (await getRoom(id));
  if (!room) return res.status(404).json({ error: 'Habitación no encontrada' });

  const rows = await all(
    `SELECT id, task_type, text, position, requires_evidence, evidence_kind, min_evidence
     FROM room_checklist_items WHERE room_id = $1 ORDER BY task_type, position`,
    [room.id]
  );
  const byType = {};
  for (const row of rows) (byType[row.task_type] ??= []).push(row);
  res.json(byType);
}));

// Reescribe entera la checklist de una habitación para un tipo de trabajo (lista vacía =
// sin checklist). No toca las tareas ya repartidas: cada una se llevó su copia.
app.put('/api/rooms/:id/checklist', requireRank('jefe'), h(async (req, res) => {
  const id = toId(req.params.id);
  const room = id && (await getRoom(id));
  if (!room) return res.status(404).json({ error: 'Habitación no encontrada' });

  const { task_type: taskType } = req.body || {};
  if (!TASK_TYPES.includes(taskType)) return res.status(400).json({ error: 'Tipo de tarea no válido' });
  if (!canSupervise(req.user, AREA_OF_TYPE[taskType])) {
    return deny(res, 'No puedes cambiar la checklist de esa área');
  }

  const items = normalizeChecklist(req.body?.items);
  if (!items) return res.status(400).json({ error: 'Falta la lista de puntos' });

  await setRoomChecklist(room.id, taskType, items);
  res.json(await getRoomChecklist(room.id, taskType));
}));

function getScheduleFull(id) {
  return one(
    `SELECT s.*, r.name AS room_name, r.floor AS room_floor,
            u.name AS assignee_name, c.name AS created_by_name
     FROM task_schedules s
     JOIN rooms r ON r.id = s.room_id
     LEFT JOIN users u ON u.id = s.assignee_id
     JOIN users c ON c.id = s.created_by
     WHERE s.id = $1`,
    [id]
  );
}

const SCHEDULE_FREQS = ['una_vez', 'diaria', 'semanal', 'mensual'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Crea una programación (recurrente o de una sola vez); no genera ninguna tarea al
// momento — eso lo hace runTaskSchedules cuando llega la hora local del hotel.
app.post('/api/task-schedules', requireRank('jefe'), h(async (req, res) => {
  const { type, title = '', description = '', freq, run_hours, date_from, date_to, week_days } = req.body || {};
  if (!SCHEDULE_FREQS.includes(freq)) return res.status(400).json({ error: 'Frecuencia no válida' });

  const hours = Array.isArray(run_hours) && run_hours.length > 0 ? run_hours : [8];
  const uniqueHours = [...new Set(hours.map((n) => Number(n)))];
  if (uniqueHours.some((n) => !Number.isInteger(n) || n < 0 || n > 23)) {
    return res.status(400).json({ error: 'Hora no válida (0-23)' });
  }

  // Días de la semana (0=domingo..6=sábado) solo tienen sentido en freq='semanal'; si
  // no vienen, se conserva el comportamiento anterior (un solo día, el de date_from).
  let weekDays = null;
  if (freq === 'semanal' && Array.isArray(week_days) && week_days.length > 0) {
    weekDays = [...new Set(week_days.map((n) => Number(n)))];
    if (weekDays.some((n) => !Number.isInteger(n) || n < 0 || n > 6)) {
      return res.status(400).json({ error: 'Día de la semana no válido (0-6)' });
    }
  }

  let dateFrom = null;
  if (date_from) {
    if (!DATE_RE.test(date_from)) return res.status(400).json({ error: 'Fecha de inicio no válida (AAAA-MM-DD)' });
    dateFrom = date_from;
  }
  let dateTo = null;
  if (date_to) {
    if (!DATE_RE.test(date_to)) return res.status(400).json({ error: 'Fecha de fin no válida (AAAA-MM-DD)' });
    dateTo = date_to;
  }
  if (freq === 'una_vez' && !dateFrom) {
    return res.status(400).json({ error: 'La programación de una sola vez necesita una fecha' });
  }
  if (dateFrom && dateTo && dateTo < dateFrom) {
    return res.status(400).json({ error: 'La fecha de fin no puede ser anterior a la de inicio' });
  }

  const v = await validateTaskPayload(req.user, req.body || {});
  if (v.error) return res.status(v.code).json({ error: v.error });

  // Una programación no lleva checklist propia: sus instancias se materializan mucho
  // después y copian la checklist que la habitación tenga EN ESE MOMENTO. Por eso, unos
  // puntos a medida en una tarea recurrente se guardan como la checklist de esas
  // habitaciones — es la única forma de que cada instancia futura los herede.
  const items = normalizeChecklist(req.body?.items);

  const ids = [];
  for (const room of v.rooms) {
    if (items) await setRoomChecklist(room.id, type, items);
    const row = await one(
      `INSERT INTO task_schedules
         (room_id, area, type, title, description, priority, assignee_id, freq, run_hours, date_from, date_to, created_by, week_days)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, COALESCE($10, (now() AT TIME ZONE $13)::date), $11, $12, $14)
       RETURNING id`,
      [
        room.id, v.taskArea, type, title, description, v.priority, v.assigneeId,
        freq, uniqueHours, dateFrom, dateTo, req.user.id, HOTEL_TZ, weekDays,
      ]
    );
    ids.push(row.id);
  }
  const rows = await Promise.all(ids.map(getScheduleFull));
  res.status(201).json(rows.length === 1 ? rows[0] : rows);
}));

// El empleado no ve programaciones; jefe y admin ven todas.
app.get('/api/task-schedules', requireRank('jefe'), h(async (req, res) => {
  const clauses = [];
  const params = [];
  if (!seesAllAreas(req.user)) {
    clauses.push(`s.area = $${params.push(req.user.area)}`);
  } else if (req.query.area && AREAS.includes(req.query.area)) {
    clauses.push(`s.area = $${params.push(req.query.area)}`);
  }
  if (req.query.all !== '1') clauses.push('s.active');
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = await all(
    `SELECT s.*, r.name AS room_name, r.floor AS room_floor,
            u.name AS assignee_name, c.name AS created_by_name
     FROM task_schedules s
     JOIN rooms r ON r.id = s.room_id
     LEFT JOIN users u ON u.id = s.assignee_id
     JOIN users c ON c.id = s.created_by
     ${where}
     ORDER BY s.active DESC, s.created_at DESC`,
    params
  );
  res.json(rows);
}));

// Cancelación blanda: preserva el FK de las instancias ya generadas y el historial.
app.delete('/api/task-schedules/:id', requireRank('jefe'), h(async (req, res) => {
  const id = toId(req.params.id);
  const schedule = id && (await one('SELECT * FROM task_schedules WHERE id = $1', [id]));
  if (!schedule) return res.status(404).json({ error: 'Programación no encontrada' });
  if (!canSupervise(req.user, schedule.area)) return deny(res, 'No puedes cancelar programaciones de esa área');
  await exec('UPDATE task_schedules SET active = false WHERE id = $1', [schedule.id]);
  res.json({ ok: true });
}));

// Transiciones permitidas de estado de tarea. `rechazada` es la devolución del
// supervisor: la tarea vuelve a manos de quien la hizo, con el motivo escrito.
// `vencida` la pone sola el barrido automático (sweepExpiredTasks), nunca un
// PATCH manual; desde ahí se puede retomar igual que desde una devolución.
// `impugnada` es la devolución de una tarea que YA estaba 'verificada': el jefe
// (o quien la revisó) detecta después que no se cumplió lo exigido.
const TASK_FLOW = {
  pendiente: ['en_curso', 'cancelada'],
  en_curso: ['hecha', 'pendiente', 'cancelada'],
  hecha: ['verificada', 'rechazada', 'en_curso'],
  rechazada: ['en_curso', 'cancelada'],
  vencida: ['en_curso', 'cancelada'],
  verificada: ['impugnada'],
  impugnada: ['en_curso', 'cancelada'],
  cancelada: [],
};

// Tarea todavía sin cerrar del lado de quien la ejecuta: cuenta como trabajo pendiente
// en tablones, contadores de habitación y resúmenes.
const OPEN_TASK_STATUSES = ['pendiente', 'en_curso', 'rechazada', 'vencida', 'impugnada'];

// Transiciones que exigen a alguien con permiso de revisión (no el propio ejecutor).
const REVIEW_STATUSES = ['verificada', 'rechazada', 'impugnada'];
// De esas, cuáles exigen escribir el motivo (una aprobación no necesita justificarse).
const NOTE_REQUIRED_STATUSES = ['rechazada', 'impugnada'];
// Tareas abiertas que el barrido de plazo puede tocar (aún no entregadas).
const EXPIRABLE_STATUSES = ['pendiente', 'en_curso', 'rechazada'];
// Al reanudar desde uno de estos estados se concede un plazo nuevo, igual que al crear.
const RESETS_DUE_ON_RESUME = ['rechazada', 'vencida', 'impugnada'];

app.patch('/api/tasks/:id', h(async (req, res) => {
  const id = toId(req.params.id);
  const task = id && (await getTaskFull(id));
  if (!task) return res.status(404).json({ error: 'Tarea no encontrada' });
  const { status, assignee_id, review_note, done_by_name } = req.body || {};

  if (assignee_id !== undefined) {
    if (!canSupervise(req.user, task.area)) return deny(res, 'Solo el jefe puede reasignar');
    const next = assignee_id === null ? null : toId(assignee_id);
    let assignee = null;
    if (next) {
      assignee = await one('SELECT * FROM users WHERE id = $1 AND active', [next]);
      if (!assignee) return res.status(400).json({ error: 'Persona asignada no válida' });
      if (!inArea(assignee, task.area)) {
        return res.status(400).json({ error: `${assignee.name} no pertenece al área de ${task.area}` });
      }
    }
    await exec('UPDATE tasks SET assignee_id = $1 WHERE id = $2', [next, task.id]);
    await recordAudit({
      entity: 'task', entityId: task.id, action: 'assignee',
      from: task.assignee_name ?? null, to: assignee?.name ?? null, actorId: req.user.id,
    });
    if (next) {
      await notifyUsers([next], {
        type: 'task_assigned', title: 'Tarea reasignada', body: `${TASK_TITLES[task.type]} · ${task.room_name}`,
        ref: { type: 'task', id: task.id },
      });
    }
  }

  if (status !== undefined) {
    if (!TASK_FLOW[task.status]?.includes(status)) {
      return res.status(400).json({ error: `No se puede pasar de ${task.status} a ${status}` });
    }

    if (REVIEW_STATUSES.includes(status)) {
      if (!canReviewTask(req.user, task)) {
        return deny(res, task.assignee_id === req.user.id
          ? 'No puedes revisar tu propio trabajo'
          : 'Solo el jefe puede revisar');
      }
      if (NOTE_REQUIRED_STATUSES.includes(status) && !review_note?.trim()) {
        return res.status(400).json({
          error: status === 'rechazada' ? 'Un rechazo necesita un motivo' : 'Impugnar una verificación necesita un motivo',
        });
      }
    } else if (status === 'cancelada') {
      if (!canSupervise(req.user, task.area)) return deny(res, 'Solo el jefe puede cancelar');
    } else if (!canWorkTask(req.user, task)) {
      return deny(res, 'Esta tarea no está asignada a ti');
    }

    if (status === 'hecha') {
      const pendingItems = task.items.filter((i) => !i.done).length;
      if (pendingItems > 0) {
        return res.status(400).json({ error: `Faltan ${pendingItems} puntos de la checklist` });
      }
      // Cinturón y tirantes: el punto ya se bloquea al marcarlo, pero la evidencia
      // pudo borrarse después de marcarlo hecho.
      const missing = await pendingEvidence(task.id);
      if (missing.length > 0) {
        return res.status(400).json({
          error: `Faltan evidencias en ${missing.length} punto(s): ${missing.map((m) => m.text).join(', ')}`,
        });
      }
      // Quién hizo el trabajo de verdad: la cuenta asignada puede no ser la persona
      // que lo ejecutó (turnos compartidos bajo un mismo usuario).
      if (!done_by_name?.trim()) {
        return res.status(400).json({ error: 'Escribe el nombre de quien completó la tarea' });
      }
    }

    const stamp = {
      en_curso: 'started_at', hecha: 'done_at', verificada: 'verified_at',
      rechazada: 'rejected_at', impugnada: 'disputed_at',
    }[status];
    await exec(
      `UPDATE tasks SET status = $1${stamp ? `, ${stamp} = now()` : ''}${status === 'hecha' ? ', done_by_name = $3' : ''} WHERE id = $2`,
      status === 'hecha' ? [status, task.id, done_by_name.trim()] : [status, task.id]
    );
    await recordAudit({
      entity: 'task', entityId: task.id, action: 'status',
      from: task.status, to: status,
      note: NOTE_REQUIRED_STATUSES.includes(status) ? String(review_note ?? '').trim() : '',
      actorId: req.user.id,
    });

    // Reanudar tras una devolución (por rechazo, impugnación o vencimiento) es
    // arrancar de cero: se concede el mismo plazo que tendría una tarea nueva.
    if (RESETS_DUE_ON_RESUME.includes(task.status) && status === 'en_curso') {
      await exec(
        `UPDATE tasks SET due_at = now() + ($1 || ' hours')::interval WHERE id = $2`,
        [TASK_SLA_HOURS[task.priority], task.id]
      );
    }

    if (REVIEW_STATUSES.includes(status)) {
      await exec('UPDATE tasks SET reviewed_by = $1, review_note = $2 WHERE id = $3', [
        req.user.id, String(review_note ?? '').trim(), task.id,
      ]);
      if (task.assignee_id && task.assignee_id !== req.user.id) {
        const titles = { verificada: 'Trabajo verificado', rechazada: 'Trabajo devuelto', impugnada: 'Verificación impugnada' };
        await notifyUsers([task.assignee_id], {
          type: 'task_review',
          title: titles[status],
          body: status === 'verificada'
            ? `${task.room_name}: aprobado por ${req.user.name}`
            : `${task.room_name}: ${String(review_note).trim()}`,
          ref: { type: 'task', id: task.id },
        });
      }
    }

    // Si alguien del área coge una tarea sin asignar, se la queda.
    if (status === 'en_curso' && !task.assignee_id && !isAtLeast(req.user, 'jefe')) {
      await exec('UPDATE tasks SET assignee_id = $1 WHERE id = $2', [req.user.id, task.id]);
    }

    // Estado de habitación derivado del trabajo (nunca pisa bloqueada ni ocupada:
    // una limpieza de repaso durante la estancia no debe sacarla de 'ocupada').
    const room = await getRoom(task.room_id);
    if (!['bloqueada', 'ocupada'].includes(room.status)) {
      if (task.type === 'limpieza') {
        if (status === 'en_curso') await setRoomStatus(room, 'en_limpieza', req.user.id);
        if (status === 'hecha') await setRoomStatus(room, 'pendiente_inspeccion', req.user.id);
        if (status === 'verificada') await setRoomStatus(room, 'lista', req.user.id);
        // Rechazada o impugnada: la habitación no está lista de verdad, vuelve a limpieza.
        if (status === 'rechazada' || status === 'impugnada') await setRoomStatus(room, 'en_limpieza', req.user.id);
      }
      if (task.type === 'inspeccion') {
        if (['hecha', 'verificada'].includes(status)) await setRoomStatus(room, 'lista', req.user.id);
        if (status === 'impugnada') await setRoomStatus(room, 'pendiente_inspeccion', req.user.id);
      }
    }

    // Completar la orden de mantenimiento resuelve su incidencia vinculada.
    if (task.incident_id && ['hecha', 'verificada'].includes(status)) {
      await resolveIncident(task.incident_id, req.user.id);
    }
  }
  res.json(await getTaskFull(task.id));
}));

app.patch('/api/task-items/:id', h(async (req, res) => {
  const id = toId(req.params.id);
  const item = id && (await one('SELECT * FROM task_items WHERE id = $1', [id]));
  if (!item) return res.status(404).json({ error: 'Punto no encontrado' });
  const task = await getTaskFull(item.task_id);
  if (!canWorkTask(req.user, task)) return deny(res, 'Esta tarea no está asignada a ti');
  if (['verificada', 'cancelada'].includes(task.status)) {
    return res.status(400).json({ error: 'La tarea ya está cerrada' });
  }

  const done = !!req.body?.done;
  // El corazón del sistema de evidencias: sin foto/vídeo, el punto no se marca.
  if (done && item.requires_evidence) {
    const { n } = await one(
      `SELECT COUNT(*)::int AS n FROM evidence
       WHERE task_item_id = $1 AND ($2 = 'cualquiera' OR kind = $2)`,
      [item.id, item.evidence_kind]
    );
    if (n < item.min_evidence) {
      const kind = { foto: 'foto', video: 'vídeo', cualquiera: 'foto o vídeo' }[item.evidence_kind];
      return res.status(400).json({
        error: `Este punto exige ${item.min_evidence} ${kind}${item.min_evidence > 1 ? 's' : ''} antes de marcarlo`,
      });
    }
  }
  await exec('UPDATE task_items SET done = $1 WHERE id = $2', [done, item.id]);
  res.json(await getTaskFull(item.task_id));
}));

// --- Evidencias ----------------------------------------------------------------

// Resuelve el objetivo (tarea/punto/incidencia) y comprueba que el usuario puede adjuntar.
async function resolveEvidenceTarget(user, body) {
  const taskItemId = body.task_item_id ? toId(body.task_item_id) : null;
  let taskId = body.task_id ? toId(body.task_id) : null;
  const incidentId = body.incident_id ? toId(body.incident_id) : null;

  if (taskItemId) {
    const item = await one('SELECT * FROM task_items WHERE id = $1', [taskItemId]);
    if (!item) return { error: 'Punto de checklist no encontrado', code: 404 };
    taskId = item.task_id;
  }
  if (taskId) {
    const task = await getTaskFull(taskId);
    if (!task) return { error: 'Tarea no encontrada', code: 404 };
    if (!canAttachEvidence(user, task)) return { error: 'Esta tarea no está asignada a ti', code: 403 };
    if (['verificada', 'cancelada'].includes(task.status)) {
      return { error: 'La tarea ya está cerrada', code: 400 };
    }
    return { taskId, taskItemId, incidentId: null, task };
  }
  if (incidentId) {
    const inc = await one('SELECT * FROM incidents WHERE id = $1', [incidentId]);
    if (!inc) return { error: 'Incidencia no encontrada', code: 404 };
    if (!inArea(user, inc.area) && !isAtLeast(user, 'jefe')) {
      return { error: 'Esta incidencia es de otra área', code: 403 };
    }
    return { taskId: null, taskItemId: null, incidentId, task: null };
  }
  return { error: 'Falta task_id, task_item_id o incident_id', code: 400 };
}

// Paso 1: el servidor firma una URL y la app sube el fichero directamente al storage.
app.post('/api/evidence/upload-url', h(async (req, res) => {
  if (!storage.isConfigured()) {
    return res.status(503).json({ error: 'El almacenamiento de evidencias no está configurado' });
  }
  const { kind, mime, size_bytes = 0 } = req.body || {};
  if (!['foto', 'video'].includes(kind)) return res.status(400).json({ error: 'kind debe ser foto o video' });
  if (!storage.isMimeAllowed(kind, mime)) {
    return res.status(400).json({ error: `Formato no admitido para ${kind}: ${mime}` });
  }
  const size = Number(size_bytes) || 0;
  if (size > storage.MAX_BYTES[kind]) {
    const mb = Math.round(storage.MAX_BYTES[kind] / 1024 / 1024);
    return res.status(400).json({ error: `El fichero supera el máximo de ${mb} MB para ${kind}` });
  }

  const target = await resolveEvidenceTarget(req.user, req.body || {});
  if (target.error) return res.status(target.code).json({ error: target.error });

  const storagePath = storage.buildPath({
    taskId: target.taskId, taskItemId: target.taskItemId, incidentId: target.incidentId, mime,
  });
  const { url, method } = await storage.createUploadUrl(storagePath);
  res.json({ upload_url: url, method, storage_path: storagePath });
}));

// Paso 2: el fichero ya está arriba; se registra y queda ligado al punto de checklist.
app.post('/api/evidence', h(async (req, res) => {
  const { kind, storage_path, mime = '', size_bytes = 0, duration_ms = null } = req.body || {};
  if (!['foto', 'video'].includes(kind)) return res.status(400).json({ error: 'kind debe ser foto o video' });
  if (!storage_path?.trim()) return res.status(400).json({ error: 'Falta storage_path' });

  const target = await resolveEvidenceTarget(req.user, req.body || {});
  if (target.error) return res.status(target.code).json({ error: target.error });
  if (!storage.pathMatchesTarget(storage_path.trim(), target)) {
    return res.status(400).json({ error: 'storage_path no corresponde al destino' });
  }
  if (!(await storage.fileExists(storage_path.trim()))) {
    return res.status(400).json({ error: 'El fichero no se ha subido al almacenamiento' });
  }

  const row = await one(
    `INSERT INTO evidence (task_id, task_item_id, incident_id, kind, storage_path, mime, size_bytes, duration_ms, uploaded_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [
      target.taskId, target.taskItemId, target.incidentId, kind, storage_path.trim(),
      String(mime), Number(size_bytes) || 0, duration_ms ? Number(duration_ms) : null, req.user.id,
    ]
  );
  const urls = await storage.createReadUrls([row.storage_path]);
  res.status(201).json({ ...row, url: urls.get(row.storage_path) ?? null, uploaded_by_name: req.user.name });
}));

app.get('/api/evidence', h(async (req, res) => {
  const taskId = req.query.task_id ? toId(req.query.task_id) : null;
  const incidentId = req.query.incident_id ? toId(req.query.incident_id) : null;
  if (!taskId && !incidentId) return res.status(400).json({ error: 'Falta task_id o incident_id' });

  if (taskId) {
    const task = await one('SELECT area FROM tasks WHERE id = $1', [taskId]);
    if (!task) return res.status(404).json({ error: 'Tarea no encontrada' });
    if (!inArea(req.user, task.area)) return deny(res, 'Esta tarea es de otra área');
  }

  const rows = await all(
    `SELECT e.*, u.name AS uploaded_by_name
     FROM evidence e JOIN users u ON u.id = e.uploaded_by
     WHERE ${taskId ? 'e.task_id = $1' : 'e.incident_id = $1'}
     ORDER BY e.created_at ASC`,
    [taskId ?? incidentId]
  );
  // El bucket es privado: cada lectura necesita su firma. Se piden todas de una vez.
  const urls = await storage.createReadUrls(rows.map((r) => r.storage_path));
  res.json(rows.map((r) => ({ ...r, url: urls.get(r.storage_path) ?? null })));
}));

// Borrar evidencia: quien la subió (mientras la tarea siga abierta) o el jefe.
app.delete('/api/evidence/:id', h(async (req, res) => {
  const id = toId(req.params.id);
  const ev = id && (await one('SELECT * FROM evidence WHERE id = $1', [id]));
  if (!ev) return res.status(404).json({ error: 'Evidencia no encontrada' });

  const task = ev.task_id ? await getTaskFull(ev.task_id) : null;
  const isOwner = ev.uploaded_by === req.user.id;
  const isSupervisor = task ? canSupervise(req.user, task.area) : isAtLeast(req.user, 'jefe');
  if (!isOwner && !isSupervisor) return deny(res);
  if (task && ['verificada', 'cancelada'].includes(task.status) && req.user.role !== 'admin') {
    return res.status(400).json({ error: 'La tarea ya está cerrada' });
  }

  // Si el punto ya estaba marcado y se queda sin evidencia, deja de estarlo:
  // el checklist no puede afirmar que algo se hizo sin la prueba que lo exige.
  await exec('DELETE FROM evidence WHERE id = $1', [ev.id]);
  if (ev.task_item_id) {
    await exec(
      `UPDATE task_items i SET done = false
       WHERE i.id = $1 AND i.requires_evidence AND i.done
         AND (SELECT COUNT(*) FROM evidence e WHERE e.task_item_id = i.id) < i.min_evidence`,
      [ev.task_item_id]
    );
  }
  try {
    await storage.removeFile(ev.storage_path);
  } catch (err) {
    // El registro ya no existe; un huérfano en el bucket no debe romper la respuesta.
    console.error('No se pudo borrar el fichero del storage:', err.message);
  }
  res.json({ ok: true });
}));

// --- Incidencias -------------------------------------------------------------

function getIncidentFull(id) {
  return one(
    `SELECT i.*, r.name AS room_name, r.floor AS room_floor, u.name AS reported_by_name,
      (SELECT t.id FROM tasks t WHERE t.incident_id = i.id LIMIT 1) AS task_id,
      (SELECT COUNT(*) FROM evidence e WHERE e.incident_id = i.id)::int AS evidence_count
     FROM incidents i
     JOIN rooms r ON r.id = i.room_id
     JOIN users u ON u.id = i.reported_by
     WHERE i.id = $1`,
    [id]
  );
}

async function resolveIncident(id, actorId = null) {
  const inc = await one('SELECT * FROM incidents WHERE id = $1', [id]);
  if (!inc || inc.status === 'resuelta') return;
  await exec(`UPDATE incidents SET status = 'resuelta', resolved_at = now() WHERE id = $1`, [id]);
  await recordAudit({ entity: 'incident', entityId: id, action: 'status', from: inc.status, to: 'resuelta', actorId });
  // Al desbloquear, la habitación necesita limpieza antes de volver a venderse.
  if (inc.blocks_room) {
    const room = await getRoom(inc.room_id);
    if (room.status === 'bloqueada') await setRoomStatus(room, 'sucia', actorId);
  }
}

// Las incidencias las ve todo el mundo: cualquiera puede reportar una avería que ve.
app.get('/api/incidents', h(async (req, res) => {
  const clauses = [];
  const params = [];
  if (req.query.status === 'abiertas') clauses.push(`i.status != 'resuelta'`);
  else if (req.query.status) clauses.push(`i.status = $${params.push(req.query.status)}`);
  if (req.query.room_id) clauses.push(`i.room_id = $${params.push(toId(req.query.room_id))}`);
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = await all(
    `SELECT i.id, i.room_id, i.title, i.priority, i.status, i.blocks_room, i.area, i.created_at,
            i.resolved_at, r.name AS room_name, u.name AS reported_by_name,
            (i.photo IS NOT NULL) AS has_photo,
            (SELECT COUNT(*) FROM evidence e WHERE e.incident_id = i.id)::int AS evidence_count
     FROM incidents i
     JOIN rooms r ON r.id = i.room_id
     JOIN users u ON u.id = i.reported_by
     ${where}
     ORDER BY CASE i.status WHEN 'resuelta' THEN 1 ELSE 0 END,
              CASE i.priority WHEN 'urgente' THEN 0 WHEN 'alta' THEN 1 WHEN 'media' THEN 2 ELSE 3 END,
              i.created_at DESC`,
    params
  );
  res.json(rows);
}));

app.get('/api/incidents/:id', h(async (req, res) => {
  const id = toId(req.params.id);
  const inc = id && (await getIncidentFull(id));
  if (!inc) return res.status(404).json({ error: 'Incidencia no encontrada' });
  res.json(inc);
}));

app.post('/api/incidents', h(async (req, res) => {
  const {
    room_id, title, description = '', priority = 'media',
    blocks_room = false, photo = null, area = 'mantenimiento',
  } = req.body || {};
  const id = toId(room_id);
  const room = id && (await getRoom(id));
  if (!room) return res.status(400).json({ error: 'Habitación no válida' });
  if (!title?.trim()) return res.status(400).json({ error: 'Falta el título de la incidencia' });
  if (!VALID_PRIORITIES.includes(priority)) return res.status(400).json({ error: 'Prioridad no válida' });
  if (!AREAS.includes(area)) return res.status(400).json({ error: 'Área no válida' });
  // Bloquear una habitación la saca de venta: es una decisión de mando, no de cualquiera.
  if (blocks_room && !isAtLeast(req.user, 'jefe')) {
    return deny(res, 'Solo un mando puede bloquear una habitación');
  }
  const incArea = area;

  const { id: incId } = await one(
    `INSERT INTO incidents (room_id, title, description, priority, blocks_room, photo, area, reported_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [room.id, title.trim(), description, priority, !!blocks_room, photo, incArea, req.user.id]
  );
  await recordAudit({ entity: 'incident', entityId: incId, action: 'created', to: 'abierta', actorId: req.user.id });

  if (blocks_room) await setRoomStatus(room, 'bloqueada', req.user.id);

  // Toda incidencia genera su orden de trabajo en el área que la resuelve (sin asignar:
  // la coge el equipo).
  const taskType = incArea === 'mantenimiento' ? 'mantenimiento' : 'general';
  await createTask({
    room,
    area: incArea,
    type: taskType,
    title: `Avería · ${room.name}: ${title.trim()}`,
    description,
    priority,
    assignee_id: null,
    incident_id: incId,
    createdBy: req.user.id,
  });

  if (priority === 'urgente' || blocks_room) {
    const recipients = (
      await all(
        `SELECT id FROM users WHERE active AND (role IN ('jefe','admin') OR area = $1)`,
        [incArea]
      )
    ).map((u) => u.id);
    await notifyUsers(recipients, {
      type: 'incident',
      title: blocks_room ? 'Incidencia bloqueante' : 'Incidencia urgente',
      body: `${room.name}: ${title.trim()}`,
      ref: { type: 'incident', id: incId },
    });
  }

  res.status(201).json(await getIncidentFull(incId));
}));

// La mueve el área que la resuelve (o cualquier mando).
// Mover una incidencia (no resolverla vía tarea) es cosa de mando del área: un
// empleado la resuelve trabajando su tarea vinculada, no tocando la incidencia directo.
app.patch('/api/incidents/:id', h(async (req, res) => {
  const id = toId(req.params.id);
  const inc = id && (await one('SELECT * FROM incidents WHERE id = $1', [id]));
  if (!inc) return res.status(404).json({ error: 'Incidencia no encontrada' });
  if (!canSupervise(req.user, inc.area)) return deny(res, 'Solo el jefe puede mover esta incidencia');

  const { status } = req.body || {};
  if (!['abierta', 'en_curso', 'resuelta'].includes(status)) {
    return res.status(400).json({ error: 'Estado no válido' });
  }
  if (status === 'resuelta') {
    await resolveIncident(inc.id, req.user.id);
    // Cierra la orden de trabajo vinculada si sigue abierta.
    await exec(
      `UPDATE tasks SET status = 'hecha', done_at = now()
       WHERE incident_id = $1 AND status = ANY($2)`,
      [inc.id, OPEN_TASK_STATUSES]
    );
  } else {
    await exec('UPDATE incidents SET status = $1 WHERE id = $2', [status, inc.id]);
    await recordAudit({ entity: 'incident', entityId: inc.id, action: 'status', from: inc.status, to: status, actorId: req.user.id });
  }
  res.json(await getIncidentFull(inc.id));
}));

// --- Historial / auditoría ------------------------------------------------------

// Mismo permiso que ver la propia entidad: una tarea, su área; una incidencia o
// habitación, cualquier autenticado (se ven en todas las áreas igual que hoy).
app.get('/api/audit', h(async (req, res) => {
  const entity = req.query.entity;
  const entityId = toId(req.query.id);
  if (!['task', 'incident', 'room'].includes(entity) || !entityId) {
    return res.status(400).json({ error: 'Falta entity (task|incident|room) o id' });
  }
  if (entity === 'task') {
    const task = await one('SELECT area FROM tasks WHERE id = $1', [entityId]);
    if (!task) return res.status(404).json({ error: 'Tarea no encontrada' });
    if (!inArea(req.user, task.area)) return deny(res, 'Esta tarea es de otra área');
  }
  const rows = await all(
    `SELECT a.id, a.action, a.from_value, a.to_value, a.note, a.created_at, u.name AS actor_name
     FROM audit_log a
     LEFT JOIN users u ON u.id = a.actor_id
     WHERE a.entity = $1 AND a.entity_id = $2
     ORDER BY a.created_at ASC`,
    [entity, entityId]
  );
  res.json(rows);
}));

// --- Objetos perdidos ---------------------------------------------------------

app.get('/api/lost-items', h(async (req, res) => {
  const clauses = [];
  const params = [];
  if (req.query.status === 'abiertos') clauses.push(`l.status != 'entregado'`);
  else if (req.query.status) clauses.push(`l.status = $${params.push(req.query.status)}`);
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = await all(
    `SELECT l.*, r.name AS room_name, u.name AS found_by_name
     FROM lost_items l
     LEFT JOIN rooms r ON r.id = l.room_id
     JOIN users u ON u.id = l.found_by
     ${where}
     ORDER BY CASE l.status WHEN 'entregado' THEN 1 ELSE 0 END, l.created_at DESC`,
    params
  );
  res.json(rows);
}));

app.post('/api/lost-items', h(async (req, res) => {
  const { room_id = null, description, photo = null } = req.body || {};
  if (!description?.trim()) return res.status(400).json({ error: 'Falta la descripción del objeto' });
  const roomId = room_id === null || room_id === undefined ? null : toId(room_id);
  if (room_id != null && !(roomId && (await getRoom(roomId)))) {
    return res.status(400).json({ error: 'Habitación no válida' });
  }
  const item = await one(
    'INSERT INTO lost_items (room_id, description, photo, found_by) VALUES ($1, $2, $3, $4) RETURNING *',
    [roomId, description.trim(), photo, req.user.id]
  );
  res.status(201).json(item);
}));

// Entregar un objeto a su dueño es una decisión con responsabilidad: del jefe para arriba.
app.patch('/api/lost-items/:id', requireRank('jefe'), h(async (req, res) => {
  const id = toId(req.params.id);
  const item = id && (await one('SELECT * FROM lost_items WHERE id = $1', [id]));
  if (!item) return res.status(404).json({ error: 'Objeto no encontrado' });
  const { status, claimant } = req.body || {};
  if (status !== undefined) {
    if (!['guardado', 'reclamado', 'entregado'].includes(status)) {
      return res.status(400).json({ error: 'Estado no válido' });
    }
    const stamp = status === 'entregado' ? ', resolved_at = now()' : '';
    await exec(`UPDATE lost_items SET status = $1${stamp} WHERE id = $2`, [status, item.id]);
  }
  if (claimant !== undefined) {
    await exec('UPDATE lost_items SET claimant = $1 WHERE id = $2', [String(claimant), item.id]);
  }
  res.json(await one('SELECT * FROM lost_items WHERE id = $1', [item.id]));
}));

// --- Inventario -----------------------------------------------------------------

app.get('/api/inventory', h(async (_req, res) => {
  res.json(await all('SELECT * FROM inventory_items ORDER BY category, name'));
}));

// Entero no negativo válido, o null si el valor no lo es (para distinguir de "no vino").
function toNonNegInt(value) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

app.post('/api/inventory', requireRank('jefe'), h(async (req, res) => {
  const { name, category = 'general', unit = 'ud', min_qty = 0, qty = 0 } = req.body || {};
  if (!name?.trim()) return res.status(400).json({ error: 'Falta el nombre del artículo' });
  const minQty = toNonNegInt(min_qty);
  const startQty = toNonNegInt(qty);
  if (minQty === null || startQty === null) {
    return res.status(400).json({ error: 'min_qty y qty deben ser enteros ≥ 0' });
  }
  const item = await one(
    'INSERT INTO inventory_items (name, category, unit, min_qty, qty) VALUES ($1, $2, $3, $4, $5) RETURNING *',
    [name.trim(), category, unit, minQty, startQty]
  );
  res.status(201).json(item);
}));

app.patch('/api/inventory/:id', requireRank('jefe'), h(async (req, res) => {
  const id = toId(req.params.id);
  const item = id && (await one('SELECT * FROM inventory_items WHERE id = $1', [id]));
  if (!item) return res.status(404).json({ error: 'Artículo no encontrado' });
  const { min_qty } = req.body || {};
  if (min_qty !== undefined) {
    const minQty = toNonNegInt(min_qty);
    if (minQty === null) return res.status(400).json({ error: 'min_qty debe ser un entero ≥ 0' });
    await exec('UPDATE inventory_items SET min_qty = $1 WHERE id = $2', [minQty, item.id]);
  }
  res.json(await one('SELECT * FROM inventory_items WHERE id = $1', [item.id]));
}));

// Movimiento de stock (positivo = entrada/reposición, negativo = consumo).
// Cualquiera puede registrar consumo: quien gasta el producto es quien limpia.
// Reponer (entrada de stock) sí es cosa de dirección.
app.post('/api/inventory/:id/movements', h(async (req, res) => {
  const id = toId(req.params.id);
  const item = id && (await one('SELECT id FROM inventory_items WHERE id = $1', [id]));
  if (!item) return res.status(404).json({ error: 'Artículo no encontrado' });
  const { delta, reason = '' } = req.body || {};
  const d = Number(delta);
  if (!d) return res.status(400).json({ error: 'delta debe ser un número distinto de 0' });
  if (d > 0 && !canManageOps(req.user)) return deny(res, 'Solo dirección puede registrar entradas de stock');

  // El descuento se hace en la propia UPDATE: leer-calcular-escribir permitiría que
  // dos consumos simultáneos dejasen el stock en negativo.
  const updated = await one(
    'UPDATE inventory_items SET qty = qty + $1 WHERE id = $2 AND qty + $1 >= 0 RETURNING *',
    [d, item.id]
  );
  if (!updated) return res.status(400).json({ error: 'No hay suficiente stock' });

  await exec(
    'INSERT INTO inventory_movements (item_id, delta, reason, user_id) VALUES ($1, $2, $3, $4)',
    [item.id, d, String(reason), req.user.id]
  );
  res.status(201).json(updated);
}));

// --- Mensajería interna (por tarea o incidencia) --------------------------------

// Misma regla que adjuntar evidencia (resolveEvidenceTarget) para que nadie lea ni
// escriba el hilo de un área ajena; el reportador de una incidencia participa de su
// propio hilo aunque la incidencia se haya derivado a otra área.
async function canAccessThread(user, taskId, incidentId) {
  if (taskId) {
    const task = await one('SELECT area FROM tasks WHERE id = $1', [taskId]);
    if (!task) return { error: 'Tarea no encontrada', code: 404 };
    if (!inArea(user, task.area)) return { error: 'Esta tarea es de otra área', code: 403 };
    return {};
  }
  const inc = await one('SELECT area, reported_by FROM incidents WHERE id = $1', [incidentId]);
  if (!inc) return { error: 'Incidencia no encontrada', code: 404 };
  if (!inArea(user, inc.area) && !isAtLeast(user, 'jefe') && inc.reported_by !== user.id) {
    return { error: 'Esta incidencia es de otra área', code: 403 };
  }
  return {};
}

app.get('/api/messages', h(async (req, res) => {
  const { task_id, incident_id } = req.query;
  if (!task_id && !incident_id) return res.status(400).json({ error: 'Falta task_id o incident_id' });
  const taskId = task_id ? toId(task_id) : null;
  const incidentId = incident_id ? toId(incident_id) : null;
  if (task_id && !taskId) return res.status(400).json({ error: 'Tarea no válida' });
  if (incident_id && !incidentId) return res.status(400).json({ error: 'Incidencia no válida' });

  const access = await canAccessThread(req.user, taskId, incidentId);
  if (access.error) return res.status(access.code).json({ error: access.error });

  const params = [];
  const taskCond = taskId ? `m.task_id = $${params.push(taskId)}` : 'm.task_id IS NULL';
  const incCond = incidentId ? `m.incident_id = $${params.push(incidentId)}` : 'm.incident_id IS NULL';
  const rows = await all(
    `SELECT m.*, u.name AS sender_name FROM messages m JOIN users u ON u.id = m.sender_id
     WHERE ${taskCond} AND ${incCond}
     ORDER BY m.created_at ASC`,
    params
  );
  res.json(rows);
}));

app.post('/api/messages', h(async (req, res) => {
  const { task_id = null, incident_id = null, text } = req.body || {};
  if (!text?.trim()) return res.status(400).json({ error: 'El mensaje está vacío' });
  if (!task_id && !incident_id) return res.status(400).json({ error: 'Falta task_id o incident_id' });

  const taskId = task_id ? toId(task_id) : null;
  const incidentId = incident_id ? toId(incident_id) : null;
  if (task_id && !taskId) return res.status(400).json({ error: 'Tarea no válida' });
  if (incident_id && !incidentId) return res.status(400).json({ error: 'Incidencia no válida' });

  const access = await canAccessThread(req.user, taskId, incidentId);
  if (access.error) return res.status(access.code).json({ error: access.error });

  const { id } = await one(
    'INSERT INTO messages (task_id, incident_id, sender_id, text) VALUES ($1, $2, $3, $4) RETURNING id',
    [taskId, incidentId, req.user.id, text.trim()]
  );
  const row = await one(
    'SELECT m.*, u.name AS sender_name FROM messages m JOIN users u ON u.id = m.sender_id WHERE m.id = $1',
    [id]
  );

  // Notifica al resto de participantes del hilo (asignado + creador de la tarea/incidencia).
  let recipients = [];
  if (taskId) {
    const task = await one('SELECT assignee_id, created_by FROM tasks WHERE id = $1', [taskId]);
    if (task) recipients = [task.assignee_id, task.created_by];
  } else if (incidentId) {
    const inc = await one('SELECT reported_by FROM incidents WHERE id = $1', [incidentId]);
    if (inc) recipients = [inc.reported_by];
  }
  await notifyUsers(recipients.filter((r) => r && r !== req.user.id), {
    type: 'message',
    title: `Mensaje de ${req.user.name}`,
    body: text.trim(),
    ref: taskId ? { type: 'task', id: taskId } : { type: 'incident', id: incidentId },
  });

  res.status(201).json(row);
}));

// --- Centro de notificaciones -----------------------------------------------------

app.get('/api/notifications', h(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 100);
  const items = await all(
    `SELECT id, type, title, body, ref_type, ref_id, read_at, created_at
     FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [req.user.id, limit]
  );
  const { n: unread_count } = await one(
    'SELECT COUNT(*)::int AS n FROM notifications WHERE user_id = $1 AND read_at IS NULL',
    [req.user.id]
  );
  res.json({ items, unread_count });
}));

app.patch('/api/notifications/read', h(async (req, res) => {
  const { ids } = req.body || {};
  const updated = Array.isArray(ids) && ids.length > 0
    ? await exec(
        'UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL AND id = ANY($2::int[])',
        [req.user.id, ids.map(toId).filter(Boolean)]
      )
    : await exec(
        'UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL',
        [req.user.id]
      );
  res.json({ ok: true, updated });
}));

// --- Entrada / fin de turno ---------------------------------------------------

// Cualquier autenticado avisa su propia llegada; no hay forma de registrarla por otro.
app.post('/api/shift/start', h(async (req, res) => {
  const log = await one(
    `INSERT INTO shift_logs (user_id, kind) VALUES ($1, 'entrada') RETURNING *`,
    [req.user.id]
  );
  res.status(201).json(log);
}));

// Cualquier autenticado avisa su propia salida; no hay forma de registrarla por otro.
app.post('/api/shift/end', h(async (req, res) => {
  const log = await one(
    `INSERT INTO shift_logs (user_id, kind) VALUES ($1, 'salida') RETURNING *`,
    [req.user.id]
  );
  const leads = (
    await all(
      `SELECT id FROM users WHERE active AND id != $1 AND role IN ('jefe','admin')`,
      [req.user.id]
    )
  ).map((u) => u.id);
  await notifyUsers(leads, {
    type: 'shift_end', title: 'Fin de turno', body: `${req.user.name} salió del hotel`,
  });
  res.status(201).json(log);
}));

// El propio empleado consulta si ya avisó su entrada/salida de hoy, para que el
// perfil sepa qué botón mostrar (no se puede fichar dos entradas seguidas sin salida).
app.get('/api/shift/today', h(async (req, res) => {
  const log = await one(
    `SELECT kind, ended_at FROM shift_logs
     WHERE user_id = $1 AND ended_at >= date_trunc('day', now())
     ORDER BY ended_at DESC LIMIT 1`,
    [req.user.id]
  );
  res.json({ lastKind: log?.kind ?? null, at: log?.ended_at ?? null });
}));

// Historial de entradas/salidas: dirección lo usa para confirmar que todo el mundo avisó.
app.get('/api/shift/logs', requireRank('jefe'), h(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const items = await all(
    `SELECT s.id, s.kind, s.ended_at, u.id AS user_id, u.name AS user_name, u.role, u.area
     FROM shift_logs s JOIN users u ON u.id = s.user_id
     ORDER BY s.ended_at DESC LIMIT $1`,
    [limit]
  );
  res.json(items);
}));

// --- Reportes / exportación (dirección) ------------------------------------------

function toCsv(rows) {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  // Las fechas llegan como Date desde Postgres: sin esto String() las volcaría como
  // "Mon Jul 13 2026 ... (hora estándar de Colombia)" en vez de una fecha ISO.
  const escape = (v) => {
    let s = v instanceof Date ? v.toISOString() : String(v ?? '');
    // Neutraliza inyección de fórmulas CSV: Excel/Sheets ejecutan celdas que
    // empiezan por = + - @ (o tab/CR). Prefijamos comilla simple → texto literal.
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return `"${s.replace(/"/g, '""')}"`;
  };
  return [headers.join(','), ...rows.map((r) => headers.map((h) => escape(r[h])).join(','))].join('\n');
}

app.get('/api/reports/export', requireRank('jefe'), h(async (req, res) => {
  const type = req.query.type === 'incidents' ? 'incidents' : 'tasks';
  const rows =
    type === 'tasks'
      ? await all(
          `SELECT t.id, r.name AS habitacion, t.area, t.type AS tipo, t.status AS estado, t.priority AS prioridad,
                  u.name AS asignado, v.name AS revisado_por, t.review_note AS motivo_rechazo,
                  (SELECT COUNT(*) FROM evidence e WHERE e.task_id = t.id)::int AS evidencias,
                  t.created_at, t.started_at, t.done_at, t.verified_at, t.rejected_at
           FROM tasks t
           JOIN rooms r ON r.id = t.room_id
           LEFT JOIN users u ON u.id = t.assignee_id
           LEFT JOIN users v ON v.id = t.reviewed_by
           ORDER BY t.created_at DESC`
        )
      : await all(
          `SELECT i.id, r.name AS habitacion, i.title AS titulo, i.area, i.status AS estado, i.priority AS prioridad,
                  i.blocks_room AS bloquea, u.name AS reportado_por, i.created_at, i.resolved_at
           FROM incidents i JOIN rooms r ON r.id = i.room_id JOIN users u ON u.id = i.reported_by
           ORDER BY i.created_at DESC`
        );
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="cgrm-${type}.csv"`);
  res.send(toCsv(rows));
}));

// --- Resumen (panel) ------------------------------------------------------------
// Cada uno ve el resumen de su alcance: el empleado, el de su área.

app.get('/api/summary', h(async (req, res) => {
  await sweepExpiredTasks();
  const scoped = !seesAllAreas(req.user);
  const areaFilter = scoped ? 'AND area = $1' : '';
  const params = scoped ? [req.user.area] : [];

  const roomsByStatus = {};
  for (const row of await all('SELECT status, COUNT(*)::int AS n FROM rooms GROUP BY status')) {
    roomsByStatus[row.status] = row.n;
  }
  const openTasks = {};
  // areaFilter (si aplica) reclama $1; el array de estados va detrás.
  const statusIdx = scoped ? 2 : 1;
  for (const row of await all(
    `SELECT type, COUNT(*)::int AS n FROM tasks
     WHERE status = ANY($${statusIdx}) ${areaFilter} GROUP BY type`,
    scoped ? [...params, OPEN_TASK_STATUSES] : [OPEN_TASK_STATUSES]
  )) {
    openTasks[row.type] = row.n;
  }
  const { n: openIncidents } = await one(
    `SELECT COUNT(*)::int AS n FROM incidents WHERE status != 'resuelta' ${areaFilter}`,
    params
  );
  // Trabajo hecho esperando revisión: es la bandeja de entrada del jefe.
  const { n: pendingReview } = await one(
    `SELECT COUNT(*)::int AS n FROM tasks WHERE status = 'hecha' ${areaFilter}`,
    params
  );
  // Desglose para el panel de control: por tipo, cuántas tareas están terminadas
  // (hecha/verificada), en progreso (en_curso) o sin arrancar (pendiente y las que
  // volvieron atrás: rechazada/vencida/impugnada). 'cancelada' queda fuera: no es
  // carga de trabajo activa.
  const tasksByType = {};
  for (const row of await all(
    `SELECT type,
       SUM(CASE WHEN status IN ('hecha', 'verificada') THEN 1 ELSE 0 END)::int AS terminado,
       SUM(CASE WHEN status = 'en_curso' THEN 1 ELSE 0 END)::int AS en_progreso,
       SUM(CASE WHEN status IN ('pendiente', 'rechazada', 'vencida', 'impugnada') THEN 1 ELSE 0 END)::int AS no_iniciado
     FROM tasks
     WHERE status != 'cancelada' ${areaFilter}
     GROUP BY type`,
    params
  )) {
    tasksByType[row.type] = { terminado: row.terminado, en_progreso: row.en_progreso, no_iniciado: row.no_iniciado };
  }
  res.json({ roomsByStatus, openTasks, openIncidents, pendingReview, tasksByType });
}));

app.get('/health', (_req, res) => res.json({ ok: true }));

// Cualquier error de la base o excepción no controlada acaba aquí.
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

app.listen(PORT, () => {
  console.log(`CgRM API escuchando en http://localhost:${PORT}`);
  console.log(`Almacenamiento de evidencias: ${storage.DRIVER}`);
  if (storage.DRIVER === 'local') {
    console.log('  ⚠ driver local (desarrollo): los ficheros van a server/uploads y son públicos.');
  }
  // Vencimiento automático de tareas y generación de tareas programadas: al
  // arrancar y luego cada 5 min, sin depender de que alguien tenga la app abierta.
  sweepExpiredTasks().catch((err) => console.error('Error en el barrido de vencimiento:', err));
  runTaskSchedules().catch((err) => console.error('Error generando tareas programadas:', err));
  setInterval(() => {
    sweepExpiredTasks().catch((err) => console.error('Error en el barrido de vencimiento:', err));
    runTaskSchedules().catch((err) => console.error('Error generando tareas programadas:', err));
    for (const [key, a] of LOGIN_ATTEMPTS) {
      if (Date.now() - a.since >= LOGIN_WINDOW_MS) LOGIN_ATTEMPTS.delete(key);
    }
    exec(`DELETE FROM notifications WHERE read_at IS NOT NULL AND created_at < now() - interval '90 days'`)
      .catch((err) => console.error('Error purgando notificaciones:', err));
  }, 5 * 60 * 1000);
});
