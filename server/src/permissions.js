// Modelo de acceso de Casa Gracia. Fuente única de verdad: ningún endpoint decide
// permisos por su cuenta, todos preguntan aquí.
//
//   empleado(área) → ejecuta el trabajo de su área. No verifica ni asigna.
//   lider(área)    → todo lo del empleado + crear, asignar, verificar y rechazar
//                    el trabajo de SU área. Ve a su equipo.
//   jefe           → lo mismo que un líder pero en TODAS las áreas, más inventario,
//                    reportes y alta de personal (empleados y líderes).
//   admin          → acceso total, incluido crear jefes/admins y forzar estados.
//                    Es el rol del desarrollador.

export const AREAS = ['limpieza', 'mantenimiento', 'recepcion', 'cocina', 'lavanderia', 'administracion'];
export const ROLES = ['empleado', 'lider', 'jefe', 'admin'];

const RANK = { empleado: 1, lider: 2, jefe: 3, admin: 4 };

export const isAtLeast = (user, role) => (RANK[user.role] ?? 0) >= RANK[role];

// Jefe y admin cruzan todas las áreas; empleado y líder viven encerrados en la suya.
export const seesAllAreas = (user) => isAtLeast(user, 'jefe');
export const inArea = (user, area) => seesAllAreas(user) || user.area === area;

// Ejecutar el trabajo: el asignado siempre; cualquiera del área si nadie la ha cogido
// todavía; y el líder del área, que puede rematar la tarea de cualquiera de su equipo.
export function canWorkTask(user, task) {
  if (isAtLeast(user, 'jefe')) return true;
  if (!inArea(user, task.area)) return false;
  if (task.assignee_id === user.id) return true;
  if (task.assignee_id == null) return true;
  return user.role === 'lider';
}

// Supervisar (crear, asignar, cancelar) dentro de un área.
export const canSupervise = (user, area) => isAtLeast(user, 'lider') && inArea(user, area);

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
  user.role === 'admin' || (user.role === 'jefe' && ['empleado', 'lider'].includes(role));

// Inventario, reportes y estado manual de habitaciones: dirección.
export const canManageOps = (user) => isAtLeast(user, 'jefe');

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
