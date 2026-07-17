// Registro de notificaciones push (Expo Push). Requiere un projectId de EAS
// (app.json → extra.eas.projectId) para funcionar en build nativo real; en
// Expo Go / sin proyecto EAS falla en silencio y el resto de la app sigue igual.
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { api } from './api';

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

export async function registerPushToken() {
  try {
    // En web no hay push de Expo: sin esta guarda se dispara el diálogo de permiso
    // del navegador, que en la PWA instalada en Android es modal y congela la app.
    if (Platform.OS === 'web') return;
    if (!Device.isDevice) return; // los simuladores no reciben push

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    const { status: existing } = await Notifications.getPermissionsAsync();
    let status = existing;
    if (status !== 'granted') {
      const req = await Notifications.requestPermissionsAsync();
      status = req.status;
    }
    if (status !== 'granted') return;

    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const { data: token } = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );
    await api.post('/api/push-tokens', { token });
  } catch (err) {
    // Sin proyecto EAS configurado esto fallará por diseño; no debe romper la app.
    console.warn('No se pudo registrar el token push:', (err as Error).message);
  }
}

function routeFor(data: Record<string, unknown>): string | null {
  const refType = data.ref_type ?? (data.taskId ? 'task' : data.incidentId ? 'incident' : null);
  const refId = data.ref_id ?? data.taskId ?? data.incidentId ?? null;
  if (!refType || !refId) return null;
  if (refType === 'task') return `/task/${refId}`;
  if (refType === 'incident') return `/incident/${refId}`;
  if (refType === 'room') return `/room/${refId}`;
  if (refType === 'inventory') return '/inventario';
  return null;
}

// Deep-link al tocar una notificación push: tanto si la app estaba abierta (listener)
// como si se abrió en frío desde la notificación (getLastNotificationResponseAsync).
export function usePushNavigation() {
  useEffect(() => {
    if (Platform.OS === 'web') return; // expo-notifications no tiene módulo nativo en web

    Notifications.getLastNotificationResponseAsync().then((response) => {
      const path = response && routeFor(response.notification.request.content.data ?? {});
      if (path) router.push(path as never);
    });

    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const path = routeFor(response.notification.request.content.data ?? {});
      if (path) router.push(path as never);
    });
    return () => sub.remove();
  }, []);
}
