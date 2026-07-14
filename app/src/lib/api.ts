// Cliente de la API CgRM. En desarrollo deriva el host del bundler de Expo
// para que funcione igual en web, emulador y dispositivo físico en la LAN.
import Constants from 'expo-constants';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

const devHost = Constants.expoConfig?.hostUri?.split(':')[0] ?? 'localhost';
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? `http://${devHost}:4000`;

let authToken: string | null = null;
export function setToken(token: string | null) {
  authToken = token;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? `Error ${res.status}`);
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body: unknown) => request<T>('POST', path, body),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
  del: <T>(path: string) => request<T>('DELETE', path),
};

// Descarga un CSV protegido por token: en web dispara la descarga del navegador,
// en móvil lo guarda en el sandbox de la app y abre la hoja de compartir nativa.
export async function downloadCsv(path: string, filename: string) {
  const res = await fetch(`${API_URL}${path}`, {
    headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
  });
  if (!res.ok) throw new ApiError(res.status, `Error ${res.status}`);
  const text = await res.text();

  if (Platform.OS === 'web') {
    const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    return;
  }

  const file = new File(Paths.cache, filename);
  if (file.exists) file.delete();
  file.write(text);
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType: 'text/csv' });
  }
}

// --- Tipos del dominio --------------------------------------------------------

export type Role = 'empleado' | 'lider' | 'jefe' | 'admin';
export type Area =
  | 'limpieza' | 'mantenimiento' | 'recepcion' | 'cocina' | 'lavanderia' | 'administracion';

export interface User {
  id: number;
  username: string;
  name: string;
  role: Role;
  // Jefe y admin no tienen área: las cruzan todas.
  area: Area | null;
  active: boolean;
}

export interface Room {
  id: number;
  name: string;
  floor: string;
  type: string;
  status: string;
  notes: string;
  open_tasks: number;
  open_incidents: number;
}

export type EvidenceKind = 'foto' | 'video';
export type TaskStatus =
  | 'pendiente' | 'en_curso' | 'hecha' | 'verificada' | 'rechazada' | 'cancelada' | 'vencida' | 'impugnada';
export type TaskType =
  | 'limpieza' | 'mantenimiento' | 'inspeccion' | 'recepcion' | 'cocina' | 'lavanderia' | 'general';

export interface TaskItem {
  id: number;
  text: string;
  done: boolean;
  position: number;
  // Un punto con requires_evidence no se puede marcar sin adjuntar la prueba.
  requires_evidence: boolean;
  evidence_kind: EvidenceKind | 'cualquiera';
  min_evidence: number;
  evidence_count: number;
}

export interface Evidence {
  id: number;
  task_id: number | null;
  task_item_id: number | null;
  incident_id: number | null;
  kind: EvidenceKind;
  storage_path: string;
  mime: string;
  size_bytes: number;
  duration_ms: number | null;
  uploaded_by: number;
  uploaded_by_name: string;
  created_at: string;
  // URL firmada, con caducidad: el bucket es privado.
  url: string | null;
}

export interface Task {
  id: number;
  room_id: number;
  area: Area;
  type: TaskType;
  title: string;
  description: string;
  priority: string;
  status: TaskStatus;
  assignee_id: number | null;
  incident_id: number | null;
  created_at: string;
  started_at: string | null;
  done_at: string | null;
  verified_at: string | null;
  rejected_at: string | null;
  due_at: string | null;
  expired_at: string | null;
  disputed_at: string | null;
  review_note: string;
  reviewed_by: number | null;
  reviewed_by_name: string | null;
  room_name: string;
  room_floor: string;
  assignee_name: string | null;
  total_items?: number;
  done_items?: number;
  evidence_count?: number;
  items?: TaskItem[];
}

export interface Incident {
  id: number;
  room_id: number;
  title: string;
  description?: string;
  priority: string;
  status: string;
  blocks_room: boolean;
  photo?: string | null;
  has_photo?: boolean;
  area: Area;
  evidence_count?: number;
  created_at: string;
  room_name: string;
  reported_by_name: string;
  task_id?: number | null;
}

export interface Summary {
  roomsByStatus: Record<string, number>;
  openTasks: Record<string, number>;
  openIncidents: number;
  // Trabajo entregado esperando revisión: la bandeja de entrada del líder.
  pendingReview: number;
}

export interface LostItem {
  id: number;
  room_id: number | null;
  room_name?: string | null;
  description: string;
  photo: string | null;
  status: 'guardado' | 'reclamado' | 'entregado';
  found_by: number;
  found_by_name: string;
  claimant: string;
  created_at: string;
  resolved_at: string | null;
}

export interface InventoryItem {
  id: number;
  name: string;
  category: string;
  unit: string;
  min_qty: number;
  qty: number;
}

export type ScheduleFreq = 'una_vez' | 'diaria' | 'semanal' | 'mensual';

export interface TaskSchedule {
  id: number;
  room_id: number;
  room_name: string;
  room_floor: string;
  area: Area;
  type: TaskType;
  title: string;
  description: string;
  priority: string;
  assignee_id: number | null;
  assignee_name: string | null;
  freq: ScheduleFreq;
  run_hours: number[];
  date_from: string;
  date_to: string | null;
  active: boolean;
  created_by_name: string;
  created_at: string;
}

export interface Message {
  id: number;
  task_id: number | null;
  incident_id: number | null;
  sender_id: number;
  sender_name: string;
  text: string;
  created_at: string;
}
