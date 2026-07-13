// API de operaciones de Casa Gracia.
import express from 'express';
import cors from 'cors';
import { all, one, exec, hashPassword } from './db.js';
import { login, publicUser, requireAuth, requireRank, deny } from './auth.js';
import { sendPush } from './push.js';
import {
  AREAS, ROLES, TASK_TYPES, AREA_OF_TYPE,
  isAtLeast, seesAllAreas, inArea,
  canWorkTask, canSupervise, canReviewTask, canAttachEvidence,
  canManageUsers, canGrantRole, canManageOps,
} from './permissions.js';
import * as storage from './storage.js';

const app = express();
app.use(cors());

// Las evidencias (fotos y vídeos) NO pasan por aquí: la app las sube con una URL
// firmada directamente al object storage. Este límite solo cubre las fotos en base64
// de incidencias y objetos perdidos, que son anteriores a ese mecanismo.
app.use(express.json({ limit: '8mb' }));

const PORT = process.env.PORT || 4000;

// --- Helpers ----------------------------------------------------------------

const ROOM_STATUSES = ['sucia', 'en_limpieza', 'pendiente_inspeccion', 'lista', 'bloqueada'];

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

function setRoomStatus(roomId, status) {
  return exec('UPDATE rooms SET status = $1 WHERE id = $2', [status, roomId]);
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
            (SELECT COUNT(*)::int FROM evidence e WHERE e.task_item_id = i.id) AS evidence_count
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
            (SELECT COUNT(*)::int FROM evidence e WHERE e.task_item_id = i.id) AS evidence_count
     FROM task_items i
     WHERE i.task_id = $1 AND i.requires_evidence
       AND (SELECT COUNT(*) FROM evidence e WHERE e.task_item_id = i.id) < i.min_evidence
     ORDER BY i.position`,
    [taskId]
  );
}

// --- Auth -------------------------------------------------------------------

app.post('/api/auth/login', h(async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
  const result = await login(username.trim().toLowerCase(), password);
  if (!result) return res.status(401).json({ error: 'Credenciales incorrectas' });
  res.json(result);
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

// El líder ve a su equipo; jefe y admin ven la plantilla entera.
app.get('/api/users', requireRank('lider'), h(async (req, res) => {
  const users = seesAllAreas(req.user)
    ? await all('SELECT * FROM users WHERE active ORDER BY area NULLS FIRST, name')
    : await all('SELECT * FROM users WHERE active AND area = $1 ORDER BY name', [req.user.area]);
  res.json(users.map(publicUser));
}));

function validateUserRoleArea(actor, role, area) {
  if (!ROLES.includes(role)) return 'Rol no válido';
  if (!canGrantRole(actor, role)) return 'No puedes otorgar ese rol';
  if (['empleado', 'lider'].includes(role)) {
    if (!AREAS.includes(area)) return 'Un empleado o líder necesita un área válida';
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
      ['empleado', 'lider'].includes(role) ? area : null,
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
      ['empleado', 'lider'].includes(nextRole) ? nextArea : null,
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
  const rooms = await all(
    `SELECT r.*,
      (SELECT COUNT(*) FROM tasks t WHERE t.room_id = r.id
         AND t.status IN ('pendiente','en_curso','rechazada'))::int AS open_tasks,
      (SELECT COUNT(*) FROM incidents i WHERE i.room_id = r.id
         AND i.status != 'resuelta')::int AS open_incidents
     FROM rooms r
     ORDER BY r.floor, r.name`
  );
  res.json(rooms);
}));

// Forzar el estado de una habitación es una decisión de mando: el flujo normal lo deriva
// del trabajo hecho.
app.patch('/api/rooms/:id', requireRank('lider'), h(async (req, res) => {
  const id = toId(req.params.id);
  const room = id && (await getRoom(id));
  if (!room) return res.status(404).json({ error: 'Habitación no encontrada' });
  const { status, notes } = req.body || {};
  if (status !== undefined && !ROOM_STATUSES.includes(status)) {
    return res.status(400).json({ error: 'Estado de habitación no válido' });
  }
  if (status !== undefined) await setRoomStatus(room.id, status);
  if (notes !== undefined) await exec('UPDATE rooms SET notes = $1 WHERE id = $2', [String(notes), room.id]);
  res.json(await getRoom(room.id));
}));

// --- Tareas -----------------------------------------------------------------

app.get('/api/tasks', h(async (req, res) => {
  const clauses = [];
  const params = [];

  // Un empleado o un líder solo ve el tablón de su área. Jefe y admin lo ven todo.
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
    clauses.push(`t.status IN ('pendiente','en_curso','rechazada')`);
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
                WHEN 'rechazada' THEN 0 WHEN 'en_curso' THEN 1
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

async function createTask({ room, area, type, title, description, priority, assignee_id, incident_id, createdBy }) {
  const { id: taskId } = await one(
    `INSERT INTO tasks (room_id, area, type, title, description, priority, assignee_id, incident_id, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
    [
      room.id, area, type, title || `${TASK_TITLES[type]} · ${room.name}`, description, priority,
      assignee_id, incident_id ?? null, createdBy,
    ]
  );

  // Copia la checklist plantilla del tipo de habitación, incluida la exigencia de evidencia.
  await exec(
    `INSERT INTO task_items (task_id, text, position, requires_evidence, evidence_kind, min_evidence)
     SELECT $1, i.text, i.position, i.requires_evidence, i.evidence_kind, i.min_evidence
     FROM checklist_template_items i
     JOIN checklist_templates t ON t.id = i.template_id
     WHERE t.room_type = $2 AND t.task_type = $3`,
    [taskId, room.type, type]
  );

  if (assignee_id) {
    sendPush([assignee_id], 'Nueva tarea asignada', `${TASK_TITLES[type]} · ${room.name}`, { taskId });
  }
  return taskId;
}

// Acepta room_id (una habitación) o room_ids (asignación masiva a varias a la vez).
app.post('/api/tasks', requireRank('lider'), h(async (req, res) => {
  const {
    room_id, room_ids, type, area, title, description = '',
    priority = 'media', assignee_id = null,
  } = req.body || {};
  if (!TASK_TYPES.includes(type)) return res.status(400).json({ error: 'Tipo de tarea no válido' });

  const taskArea = area && AREAS.includes(area) ? area : AREA_OF_TYPE[type];
  if (!canSupervise(req.user, taskArea)) return deny(res, 'No puedes crear trabajo en esa área');

  const ids = Array.isArray(room_ids) && room_ids.length > 0 ? room_ids : [room_id];
  const rooms = await Promise.all(ids.map((id) => (toId(id) ? getRoom(toId(id)) : null)));
  if (rooms.some((r) => !r)) return res.status(400).json({ error: 'Habitación no válida' });

  // Asignar a alguien de otra área dejaría una tarea que su destinatario no puede ni abrir.
  if (assignee_id) {
    const assignee = await one('SELECT * FROM users WHERE id = $1 AND active', [toId(assignee_id)]);
    if (!assignee) return res.status(400).json({ error: 'Persona asignada no válida' });
    if (!inArea(assignee, taskArea)) {
      return res.status(400).json({ error: `${assignee.name} no pertenece al área de ${taskArea}` });
    }
  }

  const taskIds = [];
  for (const room of rooms) {
    taskIds.push(
      await createTask({
        room, area: taskArea, type, title, description, priority,
        assignee_id: assignee_id ? toId(assignee_id) : null, createdBy: req.user.id,
      })
    );
  }
  if (taskIds.length === 1) return res.status(201).json(await getTaskFull(taskIds[0]));
  res.status(201).json(await Promise.all(taskIds.map(getTaskFull)));
}));

// Transiciones permitidas de estado de tarea. `rechazada` es la devolución del
// supervisor: la tarea vuelve a manos de quien la hizo, con el motivo escrito.
const TASK_FLOW = {
  pendiente: ['en_curso', 'cancelada'],
  en_curso: ['hecha', 'pendiente', 'cancelada'],
  hecha: ['verificada', 'rechazada', 'en_curso'],
  rechazada: ['en_curso', 'cancelada'],
  verificada: [],
  cancelada: [],
};

const REVIEW_STATUSES = ['verificada', 'rechazada'];

app.patch('/api/tasks/:id', h(async (req, res) => {
  const id = toId(req.params.id);
  const task = id && (await getTaskFull(id));
  if (!task) return res.status(404).json({ error: 'Tarea no encontrada' });
  const { status, assignee_id, review_note } = req.body || {};

  if (assignee_id !== undefined) {
    if (!canSupervise(req.user, task.area)) return deny(res, 'Solo el líder del área puede reasignar');
    const next = assignee_id === null ? null : toId(assignee_id);
    if (next) {
      const assignee = await one('SELECT * FROM users WHERE id = $1 AND active', [next]);
      if (!assignee) return res.status(400).json({ error: 'Persona asignada no válida' });
      if (!inArea(assignee, task.area)) {
        return res.status(400).json({ error: `${assignee.name} no pertenece al área de ${task.area}` });
      }
    }
    await exec('UPDATE tasks SET assignee_id = $1 WHERE id = $2', [next, task.id]);
    if (next) {
      sendPush([next], 'Tarea reasignada', `${TASK_TITLES[task.type]} · ${task.room_name}`, { taskId: task.id });
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
          : 'Solo el líder del área puede revisar');
      }
      if (status === 'rechazada' && !review_note?.trim()) {
        return res.status(400).json({ error: 'Un rechazo necesita un motivo' });
      }
    } else if (status === 'cancelada') {
      if (!canSupervise(req.user, task.area)) return deny(res, 'Solo el líder del área puede cancelar');
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
    }

    const stamp = {
      en_curso: 'started_at', hecha: 'done_at', verificada: 'verified_at', rechazada: 'rejected_at',
    }[status];
    await exec(
      `UPDATE tasks SET status = $1${stamp ? `, ${stamp} = now()` : ''} WHERE id = $2`,
      [status, task.id]
    );

    if (REVIEW_STATUSES.includes(status)) {
      await exec('UPDATE tasks SET reviewed_by = $1, review_note = $2 WHERE id = $3', [
        req.user.id, String(review_note ?? '').trim(), task.id,
      ]);
      if (task.assignee_id && task.assignee_id !== req.user.id) {
        sendPush(
          [task.assignee_id],
          status === 'verificada' ? 'Trabajo verificado' : 'Trabajo devuelto',
          status === 'verificada'
            ? `${task.room_name}: aprobado por ${req.user.name}`
            : `${task.room_name}: ${String(review_note).trim()}`,
          { taskId: task.id }
        );
      }
    }

    // Si alguien del área coge una tarea sin asignar, se la queda.
    if (status === 'en_curso' && !task.assignee_id && !isAtLeast(req.user, 'jefe')) {
      await exec('UPDATE tasks SET assignee_id = $1 WHERE id = $2', [req.user.id, task.id]);
    }

    // Estado de habitación derivado del trabajo (nunca pisa una habitación bloqueada).
    const room = await getRoom(task.room_id);
    if (room.status !== 'bloqueada') {
      if (task.type === 'limpieza') {
        if (status === 'en_curso') await setRoomStatus(room.id, 'en_limpieza');
        if (status === 'hecha') await setRoomStatus(room.id, 'pendiente_inspeccion');
        if (status === 'verificada') await setRoomStatus(room.id, 'lista');
        // Rechazada: la habitación no está lista, vuelve a estar en manos de limpieza.
        if (status === 'rechazada') await setRoomStatus(room.id, 'en_limpieza');
      }
      if (task.type === 'inspeccion' && ['hecha', 'verificada'].includes(status)) {
        await setRoomStatus(room.id, 'lista');
      }
    }

    // Completar la orden de mantenimiento resuelve su incidencia vinculada.
    if (task.incident_id && ['hecha', 'verificada'].includes(status)) {
      await resolveIncident(task.incident_id);
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
    const { n } = await one('SELECT COUNT(*)::int AS n FROM evidence WHERE task_item_id = $1', [item.id]);
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
    if (!inArea(user, inc.area) && !isAtLeast(user, 'lider')) {
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

// Borrar evidencia: quien la subió (mientras la tarea siga abierta) o el líder del área.
app.delete('/api/evidence/:id', h(async (req, res) => {
  const id = toId(req.params.id);
  const ev = id && (await one('SELECT * FROM evidence WHERE id = $1', [id]));
  if (!ev) return res.status(404).json({ error: 'Evidencia no encontrada' });

  const task = ev.task_id ? await getTaskFull(ev.task_id) : null;
  const isOwner = ev.uploaded_by === req.user.id;
  const isSupervisor = task ? canSupervise(req.user, task.area) : isAtLeast(req.user, 'lider');
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

async function resolveIncident(id) {
  const inc = await one('SELECT * FROM incidents WHERE id = $1', [id]);
  if (!inc || inc.status === 'resuelta') return;
  await exec(`UPDATE incidents SET status = 'resuelta', resolved_at = now() WHERE id = $1`, [id]);
  // Al desbloquear, la habitación necesita limpieza antes de volver a venderse.
  if (inc.blocks_room) {
    const room = await getRoom(inc.room_id);
    if (room.status === 'bloqueada') await setRoomStatus(room.id, 'sucia');
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
  const incArea = AREAS.includes(area) ? area : 'mantenimiento';

  const { id: incId } = await one(
    `INSERT INTO incidents (room_id, title, description, priority, blocks_room, photo, area, reported_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [room.id, title.trim(), description, priority, !!blocks_room, photo, incArea, req.user.id]
  );

  if (blocks_room) await setRoomStatus(room.id, 'bloqueada');

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
    sendPush(
      recipients,
      blocks_room ? 'Incidencia bloqueante' : 'Incidencia urgente',
      `${room.name}: ${title.trim()}`,
      { incidentId: incId }
    );
  }

  res.status(201).json(await getIncidentFull(incId));
}));

// La mueve el área que la resuelve (o cualquier mando).
app.patch('/api/incidents/:id', h(async (req, res) => {
  const id = toId(req.params.id);
  const inc = id && (await one('SELECT * FROM incidents WHERE id = $1', [id]));
  if (!inc) return res.status(404).json({ error: 'Incidencia no encontrada' });
  if (!inArea(req.user, inc.area)) return deny(res, 'Esta incidencia es de otra área');

  const { status } = req.body || {};
  if (!['abierta', 'en_curso', 'resuelta'].includes(status)) {
    return res.status(400).json({ error: 'Estado no válido' });
  }
  if (status === 'resuelta') {
    await resolveIncident(inc.id);
    // Cierra la orden de trabajo vinculada si sigue abierta.
    await exec(
      `UPDATE tasks SET status = 'hecha', done_at = now()
       WHERE incident_id = $1 AND status IN ('pendiente','en_curso','rechazada')`,
      [inc.id]
    );
  } else {
    await exec('UPDATE incidents SET status = $1 WHERE id = $2', [status, inc.id]);
  }
  res.json(await getIncidentFull(inc.id));
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

// Entregar un objeto a su dueño es una decisión con responsabilidad: de líder para arriba.
app.patch('/api/lost-items/:id', requireRank('lider'), h(async (req, res) => {
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

app.post('/api/inventory', requireRank('jefe'), h(async (req, res) => {
  const { name, category = 'general', unit = 'ud', min_qty = 0, qty = 0 } = req.body || {};
  if (!name?.trim()) return res.status(400).json({ error: 'Falta el nombre del artículo' });
  const item = await one(
    'INSERT INTO inventory_items (name, category, unit, min_qty, qty) VALUES ($1, $2, $3, $4, $5) RETURNING *',
    [name.trim(), category, unit, Number(min_qty) || 0, Number(qty) || 0]
  );
  res.status(201).json(item);
}));

app.patch('/api/inventory/:id', requireRank('jefe'), h(async (req, res) => {
  const id = toId(req.params.id);
  const item = id && (await one('SELECT * FROM inventory_items WHERE id = $1', [id]));
  if (!item) return res.status(404).json({ error: 'Artículo no encontrado' });
  const { min_qty } = req.body || {};
  if (min_qty !== undefined) {
    await exec('UPDATE inventory_items SET min_qty = $1 WHERE id = $2', [Number(min_qty), item.id]);
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

app.get('/api/messages', h(async (req, res) => {
  const { task_id, incident_id } = req.query;
  if (!task_id && !incident_id) return res.status(400).json({ error: 'Falta task_id o incident_id' });
  const params = [];
  const taskCond = task_id ? `m.task_id = $${params.push(toId(task_id))}` : 'm.task_id IS NULL';
  const incCond = incident_id ? `m.incident_id = $${params.push(toId(incident_id))}` : 'm.incident_id IS NULL';
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
  if (task_id && !(taskId && (await one('SELECT id FROM tasks WHERE id = $1', [taskId])))) {
    return res.status(400).json({ error: 'Tarea no válida' });
  }
  if (incident_id && !(incidentId && (await one('SELECT id FROM incidents WHERE id = $1', [incidentId])))) {
    return res.status(400).json({ error: 'Incidencia no válida' });
  }
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
  sendPush(
    recipients.filter((r) => r && r !== req.user.id),
    `Mensaje de ${req.user.name}`,
    text.trim(),
    { taskId, incidentId }
  );

  res.status(201).json(row);
}));

// --- Reportes / exportación (dirección) ------------------------------------------

function toCsv(rows) {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  // Las fechas llegan como Date desde Postgres: sin esto String() las volcaría como
  // "Mon Jul 13 2026 ... (hora estándar de Colombia)" en vez de una fecha ISO.
  const escape = (v) => {
    const s = v instanceof Date ? v.toISOString() : String(v ?? '');
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
// Cada uno ve el resumen de su alcance: el empleado y el líder, el de su área.

app.get('/api/summary', h(async (req, res) => {
  const scoped = !seesAllAreas(req.user);
  const areaFilter = scoped ? 'AND area = $1' : '';
  const params = scoped ? [req.user.area] : [];

  const roomsByStatus = {};
  for (const row of await all('SELECT status, COUNT(*)::int AS n FROM rooms GROUP BY status')) {
    roomsByStatus[row.status] = row.n;
  }
  const openTasks = {};
  for (const row of await all(
    `SELECT type, COUNT(*)::int AS n FROM tasks
     WHERE status IN ('pendiente','en_curso','rechazada') ${areaFilter} GROUP BY type`,
    params
  )) {
    openTasks[row.type] = row.n;
  }
  const { n: openIncidents } = await one(
    `SELECT COUNT(*)::int AS n FROM incidents WHERE status != 'resuelta' ${areaFilter}`,
    params
  );
  // Trabajo hecho esperando revisión: es la bandeja de entrada del líder.
  const { n: pendingReview } = await one(
    `SELECT COUNT(*)::int AS n FROM tasks WHERE status = 'hecha' ${areaFilter}`,
    params
  );
  res.json({ roomsByStatus, openTasks, openIncidents, pendingReview });
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
});
