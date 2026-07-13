// Envío de notificaciones push vía Expo Push API (sin SDK adicional).
import { all } from './db.js';

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
