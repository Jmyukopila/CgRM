// Caché de solo lectura para pantallas de campo: cuando no hay señal, un GET devuelve
// el último valor bueno guardado en vez de una pantalla en blanco. Los POST/PATCH/PUT
// /DELETE nunca se cachean ni se reintentan solos: sin conexión fallan con su propio
// mensaje claro (no hay cola de escritura en este alcance, ver api.ts).
import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFIX = 'cgrm.cache.';

export async function getCached<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

// Best-effort: si falla (almacenamiento lleno, JSON no serializable), no debe romper
// la petición real que sí tuvo éxito.
export function setCached(key: string, value: unknown): void {
  AsyncStorage.setItem(PREFIX + key, JSON.stringify(value)).catch(() => {});
}

// Se llama al cerrar sesión: evita que el siguiente usuario en un dispositivo
// compartido vea las pantallas cacheadas de quien tenía la sesión antes.
export async function clearCache(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const mine = keys.filter((k) => k.startsWith(PREFIX));
    if (mine.length) await AsyncStorage.multiRemove(mine);
  } catch {
    // best-effort
  }
}
