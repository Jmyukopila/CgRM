import { Roboto_500Medium, Roboto_600SemiBold, Roboto_700Bold } from '@expo-google-fonts/roboto';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, AppState, View } from 'react-native';
import { warmUp } from '../lib/api';
import { AuthProvider, useAuth } from '../lib/auth';
import { LanguageProvider } from '../lib/i18n';
import { usePushNavigation } from '../lib/push';
import { fonts } from '../lib/theme';
import { ThemeProvider, useTheme } from '../lib/theme-context';

// Ninguna pantalla monta hasta restaurar la sesión y cargar la tipografía de marca:
// evita que un deep-link o un refresco en web dispare peticiones sin token, o que la
// primera pantalla parpadee de la fuente de sistema a Roboto.
function Gate() {
  const { loading } = useAuth();
  const { colors, resolved } = useTheme();
  const [fontsLoaded] = useFonts({
    Roboto_500Medium,
    Roboto_600SemiBold,
    Roboto_700Bold,
  });
  usePushNavigation();

  // Warm-up del backend: al abrir y cada vez que la app vuelve a primer plano
  // (que es cuando Render pudo haberse dormido), para que el server ya esté
  // despierto al enviar la primera petición.
  useEffect(() => {
    warmUp();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') warmUp();
    });
    return () => sub.remove();
  }, []);

  if (loading || !fontsLoaded) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }
  return (
    <>
      <StatusBar style={resolved === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.bg },
          headerTintColor: colors.ink,
          headerTitleStyle: { fontFamily: fonts.displaySemibold, fontSize: 18 },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="registro" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="room/[id]" options={{ title: 'Habitación' }} />
        <Stack.Screen name="task/[id]" options={{ title: 'Tarea' }} />
        <Stack.Screen name="incident/[id]" options={{ title: 'Incidencia' }} />
        <Stack.Screen
          name="nueva-incidencia"
          options={{ presentation: 'modal', title: 'Nueva incidencia' }}
        />
        <Stack.Screen name="nueva-tarea-masiva" options={{ presentation: 'modal', title: 'Asignación masiva' }} />
        <Stack.Screen name="programadas" options={{ title: 'Programadas' }} />
        <Stack.Screen name="objetos-perdidos" options={{ title: 'Objetos perdidos' }} />
        <Stack.Screen name="inventario" options={{ title: 'Inventario' }} />
        <Stack.Screen name="usuarios" options={{ title: 'Usuarios' }} />
        <Stack.Screen name="reportes" options={{ title: 'Reportes' }} />
        <Stack.Screen name="notificaciones" options={{ title: 'Notificaciones' }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <LanguageProvider>
      <ThemeProvider>
        <AuthProvider>
          <Gate />
        </AuthProvider>
      </ThemeProvider>
    </LanguageProvider>
  );
}
