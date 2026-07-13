import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import { AuthProvider, useAuth } from '../lib/auth';
import { LanguageProvider } from '../lib/i18n';
import { colors } from '../lib/theme';

// Ninguna pantalla monta hasta restaurar la sesión: evita que un deep-link o
// un refresco en web dispare peticiones sin token.
function Gate() {
  const { loading } = useAuth();
  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }
  return (
    <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.bg },
          headerTintColor: colors.ink,
          headerTitleStyle: { fontWeight: '800' },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="room/[id]" options={{ title: 'Habitación' }} />
        <Stack.Screen name="task/[id]" options={{ title: 'Tarea' }} />
        <Stack.Screen
          name="nueva-incidencia"
          options={{ presentation: 'modal', title: 'Nueva incidencia' }}
        />
        <Stack.Screen name="nueva-tarea-masiva" options={{ presentation: 'modal', title: 'Asignación masiva' }} />
        <Stack.Screen name="objetos-perdidos" options={{ title: 'Objetos perdidos' }} />
        <Stack.Screen name="inventario" options={{ title: 'Inventario' }} />
        <Stack.Screen name="usuarios" options={{ title: 'Usuarios' }} />
        <Stack.Screen name="reportes" options={{ title: 'Reportes' }} />
      </Stack>
  );
}

export default function RootLayout() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <StatusBar style="dark" />
        <Gate />
      </AuthProvider>
    </LanguageProvider>
  );
}
