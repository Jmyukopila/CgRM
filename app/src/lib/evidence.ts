// Captura y subida de evidencias (foto y vídeo).
//
// El fichero NO pasa por la API: se pide una URL firmada, se sube directo al object
// storage y solo después se registra. Un vídeo de un minuto son decenas de MB, y en
// nativo se envía como stream (`File` de expo-file-system a `fetch` de expo/fetch),
// sin cargarlo entero en memoria.
import * as ImagePicker from 'expo-image-picker';
import { File } from 'expo-file-system';
import { fetch as expoFetch } from 'expo/fetch';
import { Platform } from 'react-native';
import { api, ApiError, type Evidence, type EvidenceKind } from './api';

export type Source = 'camara' | 'galeria';

export interface EvidenceTarget {
  task_id?: number;
  task_item_id?: number;
  incident_id?: number;
}

interface UploadTicket {
  upload_url: string;
  method: string;
  storage_path: string;
}

const DEFAULT_MIME: Record<EvidenceKind, string> = { foto: 'image/jpeg', video: 'video/mp4' };

// La cámara es la vía por defecto: la evidencia vale por hacerse en el sitio. La galería
// existe porque en un pasillo sin cobertura se acaba tirando la foto con la app de sistema.
async function pick(kind: EvidenceKind, source: Source) {
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: kind === 'foto' ? ['images'] : ['videos'],
    quality: 0.6,
    videoMaxDuration: 60,
  };

  if (source === 'camara') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) throw new Error('Sin permiso de cámara');
    return ImagePicker.launchCameraAsync(options);
  }
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) throw new Error('Sin permiso de galería');
  return ImagePicker.launchImageLibraryAsync(options);
}

// Devuelve el cuerpo que se manda tal cual en el PUT, y su tamaño real (el servidor
// rechaza la firma si excede el máximo, así que hay que saberlo antes de pedirla).
async function readBinary(uri: string, fallbackSize: number) {
  if (Platform.OS === 'web') {
    const blob = await (await fetch(uri)).blob();
    return { body: blob as unknown as BodyInit, size: blob.size };
  }
  const file = new File(uri);
  return { body: file as unknown as BodyInit, size: file.size ?? fallbackSize };
}

// Captura, sube y registra. Devuelve null si el usuario cancela el selector.
export async function captureEvidence(
  kind: EvidenceKind,
  source: Source,
  target: EvidenceTarget
): Promise<Evidence | null> {
  const result = await pick(kind, source);
  if (result.canceled) return null;

  const asset = result.assets[0];
  const mime = asset.mimeType ?? DEFAULT_MIME[kind];
  const { body, size } = await readBinary(asset.uri, asset.fileSize ?? 0);

  const ticket = await api.post<UploadTicket>('/api/evidence/upload-url', {
    ...target,
    kind,
    mime,
    size_bytes: size,
  });

  const doFetch = Platform.OS === 'web' ? fetch : expoFetch;
  const res = await doFetch(ticket.upload_url, {
    method: ticket.method,
    headers: { 'Content-Type': mime },
    body,
  });
  if (!res.ok) {
    throw new ApiError(res.status, `No se pudo subir el fichero (${res.status})`);
  }

  return api.post<Evidence>('/api/evidence', {
    ...target,
    kind,
    mime,
    size_bytes: size,
    duration_ms: asset.duration ?? null,
    storage_path: ticket.storage_path,
  });
}

export const listEvidence = (target: { task_id?: number; incident_id?: number }) => {
  const query = target.task_id ? `task_id=${target.task_id}` : `incident_id=${target.incident_id}`;
  return api.get<Evidence[]>(`/api/evidence?${query}`);
};

export const deleteEvidence = (id: number) => api.del<{ ok: true }>(`/api/evidence/${id}`);
