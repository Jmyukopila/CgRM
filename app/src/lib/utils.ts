import type { Room } from './api';

// Agrupa habitaciones por planta preservando el orden de llegada (ya viene
// ordenado por planta/nombre desde GET /api/rooms).
export function groupByFloor(rooms: Room[]): [string, Room[]][] {
  const groups = new Map<string, Room[]>();
  for (const r of rooms) {
    if (!groups.has(r.floor)) groups.set(r.floor, []);
    groups.get(r.floor)!.push(r);
  }
  return [...groups.entries()];
}
