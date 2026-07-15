// Envío de notificaciones push vía Expo Push API (sin SDK adicional).
import { all, exec } from './db.js';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

// Best-effort: nunca lanza. Los handlers la disparan sin await, así que un fallo
// aquí (Expo caído, DB, usuario sin token) no puede romper el flujo que la origina.
export async function sendPush(userIds, title, body, data = {}) {
  try {
    const ids = [...new Set(userIds)].filter(Boolean);
    if (ids.length === 0) return;
    const rows = await all(
      'SELECT DISTINCT token FROM push_tokens WHERE user_id = ANY($1::int[])',
      [ids]
    );
    if (rows.length === 0) return;

    const messages = rows.map((r) => ({ to: r.token, title, body, data, sound: 'default' }));
    await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(messages),
    });
  } catch (err) {
    console.error('Error enviando push:', err.message);
  }
}

// Persiste la notificación en el centro de notificaciones (para que sobreviva aunque
// el push falle, el dispositivo esté offline o no tenga projectId de EAS configurado)
// y además intenta el push, igual que antes. ref liga la notificación a su recurso
// para el deep-link de la app.
export async function notifyUsers(userIds, { type, title, body = '', ref = null }) {
  const ids = [...new Set(userIds)].filter(Boolean);
  if (ids.length === 0) return;
  try {
    for (const uid of ids) {
      await exec(
        `INSERT INTO notifications (user_id, type, title, body, ref_type, ref_id)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [uid, type, title, body, ref?.type ?? null, ref?.id ?? null]
      );
    }
  } catch (err) {
    console.error('Error guardando notificación:', err.message);
  }
  const data = ref ? { ref_type: ref.type, ref_id: ref.id } : {};
  sendPush(ids, title, body, data);
}
