// Modelo de acceso de Casa Gracia. Fuente única de verdad: ningún endpoint decide
// permisos por su cuenta, todos preguntan aquí.
//
//   empleado(área) → ejecuta el trabajo de su área. No verifica ni asigna.
//   jefe           → crear, asignar, verificar y rechazar trabajo en TODAS las áreas,
//                    más inventario, reportes y alta de personal (empleados). Es el
//                    dueño/gerente del hotel.
//   admin          → acceso total, incluido crear jefes/admins y forzar estados.
//                    Es el rol del desarrollador.

export const AREAS = ['limpieza', 'mantenimiento', 'recepcion', 'cocina', 'lavanderia', 'administracion'];
export const ROLES = ['empleado', 'jefe', 'admin'];

const RANK = { empleado: 1, jefe: 2, admin: 3 };

export const isAtLeast = (user, role) => (RANK[user.role] ?? 0) >= RANK[role];

// Jefe y admin cruzan todas las áreas; un empleado sin área asignada (cuenta genérica)
// también, ya que no tiene una sola área en la que "vivir encerrado".
export const seesAllAreas = (user) => isAtLeast(user, 'jefe') || user.area == null;
export const inArea = (user, area) => seesAllAreas(user) || user.area === area;

// Ejecutar el trabajo: el asignado siempre; cualquiera del área si nadie la ha cogido
// todavía (o, si se repartió a un grupo concreto, solo alguien de ese grupo); el jefe
// puede rematar la tarea de cualquiera en cualquier área.
export function canWorkTask(user, task) {
  if (isAtLeast(user, 'jefe')) return true;
  if (!inArea(user, task.area)) return false;
  if (task.assignee_id === user.id) return true;
  if (task.assignee_id != null) return false;
  if (task.assignee_group?.length) return task.assignee_group.includes(user.id);
  return true;
}

// Supervisar (crear, asignar, cancelar) dentro de un área.
export const canSupervise = (user, area) => isAtLeast(user, 'jefe') && inArea(user, area);

// Verificar o rechazar. Nadie firma su propio trabajo: si el líder ejecutó la tarea,
// la valida su jefe. El admin queda exento porque es quien depura el sistema.
export function canReviewTask(user, task) {
  if (user.role === 'admin') return true;
  if (!canSupervise(user, task.area)) return false;
  return task.assignee_id !== user.id;
}

// Subir o borrar evidencia de una tarea: quien puede trabajarla.
export const canAttachEvidence = (user, task) => canWorkTask(user, task);

export const canManageUsers = (user) => isAtLeast(user, 'jefe');

// Un jefe da de alta a su gente; solo el admin fabrica jefes y otros admins.
export const canGrantRole = (user, role) =>
  user.role === 'admin' || (user.role === 'jefe' && role === 'empleado');

// Inventario, reportes y estado manual de habitaciones: dirección.
export const canManageOps = (user) => isAtLeast(user, 'jefe');

// Transiciones manuales válidas de estado de habitación (PATCH /api/rooms/:id).
// 'ocupada' queda fuera por completo: solo entra/sale por check-in/check-out.
export const ROOM_FLOW = {
  sucia: ['en_limpieza', 'bloqueada'],
  en_limpieza: ['sucia', 'pendiente_inspeccion', 'bloqueada'],
  pendiente_inspeccion: ['en_limpieza', 'lista', 'bloqueada'],
  lista: ['sucia', 'bloqueada'],
  ocupada: [],
  bloqueada: ['sucia'],
};

// Quién puede forzar cada transición manual. El admin puede todas (depura el sistema).
export function canSetRoomStatus(user, room, next) {
  if (user.role === 'admin') return ROOM_FLOW[room.status]?.includes(next) ?? false;
  if (!ROOM_FLOW[room.status]?.includes(next)) return false;
  if (next === 'bloqueada') return isAtLeast(user, 'jefe');
  if (room.status === 'bloqueada') return isAtLeast(user, 'jefe');
  // Firmar la inspección (pasar a 'lista') es cosa de mando de limpieza.
  if (room.status === 'pendiente_inspeccion' && next === 'lista') {
    return canSupervise(user, 'limpieza');
  }
  return inArea(user, 'limpieza') || inArea(user, 'recepcion') || isAtLeast(user, 'jefe');
}

// Dar de alta/cerrar una estancia: dirección o el equipo de recepción.
export const canManageStays = (user) => isAtLeast(user, 'jefe') || user.area === 'recepcion';

// Área por defecto de un tipo de trabajo (la inspección la ejecuta limpieza).
export const AREA_OF_TYPE = {
  limpieza: 'limpieza',
  inspeccion: 'limpieza',
  mantenimiento: 'mantenimiento',
  recepcion: 'recepcion',
  cocina: 'cocina',
  lavanderia: 'lavanderia',
  general: 'administracion',
};

export const TASK_TYPES = Object.keys(AREA_OF_TYPE);
