// Cliente de la API CgRM. En desarrollo deriva el host del bundler de Expo
// para que funcione igual en web, emulador y dispositivo físico en la LAN.
import Constants from 'expo-constants';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

// Prioridad de resolución del backend:
//   1. EXPO_PUBLIC_API_URL  — variable de entorno inyectada en el build.
//   2. extra.apiUrl (app.json) — queda baqueada dentro de la APK instalada.
//   3. host del bundler de Expo — solo en desarrollo (web/emulador/LAN).
// En una APK real hostUri es undefined, así que extra.apiUrl es OBLIGATORIO:
// sin él la app intentaría hablar con localhost (el propio teléfono) y no conectaría.
const extra = Constants.expoConfig?.extra as { apiUrl?: string } | undefined;
const devHost = Constants.expoConfig?.hostUri?.split(':')[0] ?? 'localhost';
export const API_URL =
  process.env.EXPO_PUBLIC_API_URL || extra?.apiUrl || `http://${devHost}:4000`;

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

// 60s (no 15s) como red de seguridad ante el cold-start de Render: si el keepalive
// falla o es de madrugada, el servicio tarda ~30-50s en despertar. Un fallo real de
// red rechaza al instante (no espera el timeout), así que este margen solo aplica
// cuando el servidor está conectado pero lento en responder.
const REQUEST_TIMEOUT_MS = 60000;

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (err) {
    // status 0 = fallo de red/timeout (nunca llegó a haber respuesta del servidor),
    // para que las pantallas lo distingan de un error de negocio (4xx/5xx).
    const timedOut = err instanceof Error && err.name === 'AbortError';
    throw new ApiError(0, timedOut ? 'El servidor tardó demasiado en responder' : 'No hay conexión con el servidor');
  } finally {
    clearTimeout(timeout);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? `Error ${res.status}`);
  return data as T;
}

// Despierta el backend de Render (plan free duerme tras ~15 min de inactividad) sin
// bloquear ni lanzar: se llama al abrir la app y al volver de segundo plano, para que
// el servidor esté listo cuando el usuario envíe el login y no se coma el cold-start.
export function warmUp() {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  fetch(`${API_URL}/healthz`, { signal: controller.signal })
    .catch(() => {})
    .finally(() => clearTimeout(t));
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body: unknown) => request<T>('POST', path, body),
  put: <T>(path: string, body: unknown) => request<T>('PUT', path, body),
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

export type Role = 'empleado' | 'jefe' | 'admin';
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

export type RoomStatus =
  | 'sucia' | 'en_limpieza' | 'pendiente_inspeccion' | 'lista' | 'ocupada' | 'bloqueada';

export interface Room {
  id: number;
  name: string;
  floor: string;
  type: string;
  status: RoomStatus;
  notes: string;
  open_tasks: number;
  open_incidents: number;
  // Estancia activa (null si la habitación está libre).
  stay_id: number | null;
  guest_name: string | null;
  expected_checkout: string | null;
}

export interface RoomStay {
  id: number;
  room_id: number;
  guest_name: string;
  notes: string;
  checkin_at: string;
  expected_checkout: string | null;
  checkout_at: string | null;
  checked_in_by: number;
  checked_in_by_name: string;
  checked_out_by: number | null;
  checked_out_by_name: string | null;
}

export type AuditEntity = 'task' | 'incident' | 'room';

export interface AuditEntry {
  id: number;
  action: string;
  from_value: string | null;
  to_value: string | null;
  note: string;
  actor_name: string | null;
  created_at: string;
}

export type NotificationType =
  | 'task_assigned' | 'task_review' | 'incident' | 'message' | 'checkout';

export interface AppNotification {
  id: number;
  type: NotificationType;
  title: string;
  body: string;
  ref_type: 'task' | 'incident' | 'room' | null;
  ref_id: number | null;
  read_at: string | null;
  created_at: string;
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

// Un punto de la checklist PROPIA de una habitación: la que se copia a cada tarea nueva
// de ese tipo de trabajo en ese sitio. Editarla no toca las tareas ya repartidas.
export interface RoomChecklistItem {
  id: number;
  task_type: TaskType;
  text: string;
  position: number;
  requires_evidence: boolean;
  evidence_kind: EvidenceKind | 'cualquiera';
  min_evidence: number;
}

// GET /api/rooms/:id/checklist devuelve los puntos agrupados por tipo de trabajo.
export type RoomChecklist = Partial<Record<TaskType, RoomChecklistItem[]>>;

// Lo que la app manda al crear una tarea con puntos a medida o al reescribir la checklist
// de una habitación: sin id (aún no existe) y sin posición (la fija el orden del array).
export interface ChecklistDraft {
  text: string;
  requires_evidence: boolean;
  evidence_kind: EvidenceKind | 'cualquiera';
  min_evidence: number;
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
  // Quién hizo el trabajo de verdad: obligatorio al marcar la tarea como hecha,
  // porque la cuenta asignada puede no ser la persona que la ejecutó.
  done_by_name: string | null;
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
  // Por tipo de tarea, para los anillos del panel de control.
  tasksByType: Record<string, { terminado: number; en_progreso: number; no_iniciado: number }>;
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
  // Días de la semana (0=domingo..6=sábado) para freq='semanal'; null = un solo día,
  // el de la semana de date_from (comportamiento previo a la recurrencia multi-día).
  week_days: number[] | null;
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
