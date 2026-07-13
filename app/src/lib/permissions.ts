// Espejo de server/src/permissions.js. La API es la que manda: esto solo evita
// enseñar botones que el servidor va a rechazar con un 403.
import type { Area, Role, Task, User } from './api';

export const AREAS: Area[] = [
  'limpieza', 'mantenimiento', 'recepcion', 'cocina', 'lavanderia', 'administracion',
];

export const ROLES: Role[] = ['empleado', 'lider', 'jefe', 'admin'];

const RANK: Record<Role, number> = { empleado: 1, lider: 2, jefe: 3, admin: 4 };

export const isAtLeast = (user: User | null, role: Role) =>
  !!user && RANK[user.role] >= RANK[role];

export const seesAllAreas = (user: User | null) => isAtLeast(user, 'jefe');

export const inArea = (user: User | null, area: Area) =>
  seesAllAreas(user) || (!!user && user.area === area);

export function canWorkTask(user: User | null, task: Task) {
  if (!user) return false;
  if (isAtLeast(user, 'jefe')) return true;
  if (!inArea(user, task.area)) return false;
  if (task.assignee_id === user.id) return true;
  if (task.assignee_id === null) return true;
  return user.role === 'lider';
}

export const canSupervise = (user: User | null, area: Area) =>
  isAtLeast(user, 'lider') && inArea(user, area);

// Nadie firma su propio trabajo (salvo el admin, que depura el sistema).
export function canReviewTask(user: User | null, task: Task) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (!canSupervise(user, task.area)) return false;
  return task.assignee_id !== user.id;
}

export const canManageUsers = (user: User | null) => isAtLeast(user, 'jefe');

export const canGrantRole = (user: User | null, role: Role) =>
  user?.role === 'admin' || (user?.role === 'jefe' && ['empleado', 'lider'].includes(role));

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
