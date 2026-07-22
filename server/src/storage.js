// Almacenamiento de evidencias (fotos y vídeos).
//
// Los bytes NUNCA pasan por el API: la app pide una URL firmada, sube el fichero
// directamente al object storage y luego confirma el registro. Un vídeo de 30 s son
// decenas de MB — pasarlos en base64 por el JSON del API (como hacían las fotos de
// incidencias) reventaría el límite de payload y el coste de Postgres.
//
// STORAGE_DRIVER=supabase → Supabase Storage (producción).
// STORAGE_DRIVER=local    → carpeta server/uploads servida por este mismo servidor,
//                           para desarrollar y probar sin credenciales. No usar en producción.

import { createHmac, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
import { JWT_SECRET } from './auth.js';

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
const BUCKET = process.env.SUPABASE_BUCKET || 'evidencias';

export const DRIVER = process.env.STORAGE_DRIVER || (SUPABASE_URL && SERVICE_KEY ? 'supabase' : 'local');

const PORT = process.env.PORT || 4000;
const PUBLIC_URL = (process.env.PUBLIC_URL || `http://localhost:${PORT}`).replace(/\/+$/, '');
const READ_TTL = 3600; // 1 h: suficiente para ver la evidencia sin dejar el enlace vivo para siempre

export const UPLOAD_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)), '..', 'uploads'
);

// Límites por tipo. La app comprime la foto antes de subir; el vídeo va tal cual.
export const MAX_BYTES = { foto: 15 * 1024 * 1024, video: 120 * 1024 * 1024 };

const EXT = {
  'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic',
  'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm',
};

export function isMimeAllowed(kind, mime) {
  if (!EXT[mime]) return false;
  return kind === 'foto' ? mime.startsWith('image/') : mime.startsWith('video/');
}

// Ruta dentro del bucket. El uuid evita colisiones y que se pueda adivinar una ruta ajena.
export function buildPath({ taskId, taskItemId, incidentId, lostItemId, mime }) {
  const ext = EXT[mime] || 'bin';
  const scope = taskId
    ? `task/${taskId}/${taskItemId ? `item-${taskItemId}` : 'general'}`
    : lostItemId
      ? `lost/${lostItemId}`
      : `incident/${incidentId}`;
  return `${scope}/${randomUUID()}.${ext}`;
}

// Inverso de buildPath: comprueba que una ruta ya subida corresponde de verdad al
// target que se está registrando, para que un usuario autenticado no pueda anotar
// bajo su tarea el fichero que subió otro (el UNIQUE de storage_path solo evita
// duplicar el mismo registro, no ata el path a su destino).
export function pathMatchesTarget(p, { taskId, taskItemId, incidentId, lostItemId }) {
  const prefix = taskId
    ? `task/${taskId}/${taskItemId ? `item-${taskItemId}` : 'general'}/`
    : lostItemId
      ? `lost/${lostItemId}/`
      : `incident/${incidentId}/`;
  return typeof p === 'string' && p.startsWith(prefix) && /^[0-9a-f-]{36}\.[a-z0-9]{2,5}$/i.test(p.slice(prefix.length));
}

// --- Driver local -------------------------------------------------------------
// La firma impide que un cliente autenticado escriba en una ruta arbitraria del disco.

const sign = (p) => createHmac('sha256', JWT_SECRET).update(p).digest('hex').slice(0, 32);

export function verifyLocalSignature(p, sig) {
  return typeof sig === 'string' && sig.length === 32 && sign(p) === sig;
}

export async function writeLocal(p, buffer) {
  const dest = path.join(UPLOAD_DIR, p);
  // Defensa en profundidad: la firma ya acota la ruta, pero un `..` nunca debe escapar.
  if (!dest.startsWith(UPLOAD_DIR + path.sep)) throw new Error('Ruta de subida no válida');
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.writeFile(dest, buffer);
}

// --- Supabase Storage ---------------------------------------------------------

async function supabase(method, endpoint, body) {
  const res = await fetch(`${SUPABASE_URL}/storage/v1${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${SERVICE_KEY}`,
      apikey: SERVICE_KEY,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    throw new Error(`Supabase Storage ${method} ${endpoint}: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

// --- API pública --------------------------------------------------------------

export function isConfigured() {
  return DRIVER === 'local' || Boolean(SUPABASE_URL && SERVICE_KEY);
}

// URL a la que la app sube el fichero (PUT con el binario en el cuerpo).
export async function createUploadUrl(storagePath) {
  if (DRIVER === 'local') {
    return { url: `${PUBLIC_URL}/uploads/${storagePath}?sig=${sign(storagePath)}`, method: 'PUT' };
  }
  const { url } = await supabase('POST', `/object/upload/sign/${BUCKET}/${storagePath}`);
  return { url: `${SUPABASE_URL}/storage/v1${url}`, method: 'PUT' };
}

// URLs de lectura, en lote: el bucket es privado, así que cada vista necesita firma.
export async function createReadUrls(paths) {
  const out = new Map();
  if (paths.length === 0) return out;
  if (DRIVER === 'local') {
    for (const p of paths) out.set(p, `${PUBLIC_URL}/uploads/${p}`);
    return out;
  }
  const rows = await supabase('POST', `/object/sign/${BUCKET}`, { expiresIn: READ_TTL, paths });
  for (const row of rows) {
    if (row.signedURL) out.set(row.path, `${SUPABASE_URL}/storage/v1${row.signedURL}`);
  }
  return out;
}

// Comprueba que el fichero está realmente subido antes de registrar la evidencia:
// sin esto, un cliente podía pedir upload-url, saltarse el PUT y registrar igual un
// punto que exige foto/vídeo sin haber subido nada.
export async function fileExists(storagePath) {
  if (DRIVER === 'local') {
    try {
      await fs.access(path.join(UPLOAD_DIR, storagePath));
      return true;
    } catch {
      return false;
    }
  }
  const res = await fetch(
    `${SUPABASE_URL}/storage/v1/object/info/${BUCKET}/${storagePath}`,
    { headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY } }
  );
  return res.ok;
}

export async function removeFile(storagePath) {
  if (DRIVER === 'local') {
    await fs.rm(path.join(UPLOAD_DIR, storagePath), { force: true });
    return;
  }
  await supabase('DELETE', `/object/${BUCKET}/${storagePath}`);
}
