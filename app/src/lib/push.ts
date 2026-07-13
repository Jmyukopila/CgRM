// Registro de notificaciones push (Expo Push). Requiere un projectId de EAS
// (app.json → extra.eas.projectId) para funcionar en build nativo real; en
// Expo Go / sin proyecto EAS falla en silencio y el resto de la app sigue igual.
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { api } from './api';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function registerPushToken() {
  try {
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
