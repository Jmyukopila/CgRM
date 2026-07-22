// Espejo de server/src/permissions.js. La API es la que manda: esto solo evita
// enseñar botones que el servidor va a rechazar con un 403.
import type { Area, Role, Room, RoomStatus, Task, User } from './api';

export const AREAS: Area[] = [
  'limpieza', 'mantenimiento', 'recepcion', 'cocina', 'lavanderia', 'administracion',
];

export const ROLES: Role[] = ['empleado', 'jefe', 'admin'];

const RANK: Record<Role, number> = { empleado: 1, jefe: 2, admin: 3 };

export const isAtLeast = (user: User | null, role: Role) =>
  !!user && RANK[user.role] >= RANK[role];

// Jefe y admin cruzan todas las áreas; un empleado sin área asignada (cuenta
// genérica) también, ya que no tiene una sola área en la que "vivir encerrado".
export const seesAllAreas = (user: User | null) => isAtLeast(user, 'jefe') || (!!user && user.area == null);

export const inArea = (user: User | null, area: Area) =>
  seesAllAreas(user) || (!!user && user.area === area);

export function canWorkTask(user: User | null, task: Task) {
  if (!user) return false;
  if (isAtLeast(user, 'jefe')) return true;
  if (!inArea(user, task.area)) return false;
  if (task.assignee_id === user.id) return true;
  return task.assignee_id === null;
}

export const canSupervise = (user: User | null, area: Area) =>
  isAtLeast(user, 'jefe') && inArea(user, area);

// Nadie firma su propio trabajo (salvo el admin, que depura el sistema).
export function canReviewTask(user: User | null, task: Task) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (!canSupervise(user, task.area)) return false;
  return task.assignee_id !== user.id;
}

export const canManageUsers = (user: User | null) => isAtLeast(user, 'jefe');

export const canGrantRole = (user: User | null, role: Role) =>
  user?.role === 'admin' || (user?.role === 'jefe' && role === 'empleado');

export const canManageOps = (user: User | null) => isAtLeast(user, 'jefe');

export const AREA_OF_TYPE: Record<string, Area> = {
  limpieza: 'limpieza',
  inspeccion: 'limpieza',
  mantenimiento: 'mantenimiento',
  recepcion: 'recepcion',
  cocina: 'cocina',
  lavanderia: 'lavanderia',
  general: 'administracion',
};

// Transiciones manuales válidas de estado de habitación. 'ocupada' queda fuera:
// solo entra/sale por check-in/check-out (POST /api/rooms/:id/checkin|checkout).
export const ROOM_FLOW: Record<RoomStatus, RoomStatus[]> = {
  sucia: ['en_limpieza', 'bloqueada'],
  en_limpieza: ['sucia', 'pendiente_inspeccion', 'bloqueada'],
  pendiente_inspeccion: ['en_limpieza', 'lista', 'bloqueada'],
  lista: ['sucia', 'bloqueada'],
  ocupada: [],
  bloqueada: ['sucia'],
};

// Espejo exacto de canSetRoomStatus en server/src/permissions.js.
export function canSetRoomStatus(user: User | null, room: Room, next: RoomStatus) {
  if (!user) return false;
  if (user.role === 'admin') return ROOM_FLOW[room.status]?.includes(next) ?? false;
  if (!ROOM_FLOW[room.status]?.includes(next)) return false;
  if (next === 'bloqueada') return isAtLeast(user, 'jefe');
  if (room.status === 'bloqueada') return isAtLeast(user, 'jefe');
  if (room.status === 'pendiente_inspeccion' && next === 'lista') {
    return canSupervise(user, 'limpieza');
  }
  return inArea(user, 'limpieza') || inArea(user, 'recepcion') || isAtLeast(user, 'jefe');
}

export const canManageStays = (user: User | null) =>
  isAtLeast(user, 'jefe') || user?.area === 'recepcion';
