import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, Redirect, Tabs, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View, type ColorValue } from 'react-native';
import Animated from 'react-native-reanimated';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useT } from '../../lib/i18n';
import { useTabIconBounce } from '../../lib/motion';
import { isAtLeast } from '../../lib/permissions';
import { fonts } from '../../lib/theme';
import { useTheme } from '../../lib/theme-context';

function NotificationBell() {
  const { colors } = useTheme();
  const [unread, setUnread] = useState(0);

  useFocusEffect(
    useCallback(() => {
      const poll = () => {
        api
          .get<{ unread_count: number }>('/api/notifications?limit=1')
          .then((r) => setUnread(r.unread_count))
          .catch(() => {});
      };
      poll();
      const interval = setInterval(poll, 30000);
      return () => clearInterval(interval);
    }, [])
  );

  return (
    <Pressable onPress={() => router.push('/notificaciones' as any)} hitSlop={8} style={{ marginLeft: 16 }}>
      <Ionicons name="notifications-outline" size={24} color={colors.ink} />
      {unread > 0 && (
        <View
          style={{
            position: 'absolute',
            top: -4,
            right: -4,
            minWidth: 16,
            height: 16,
            borderRadius: 8,
            backgroundColor: colors.danger,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 2,
          }}
        >
          <Text style={{ color: colors.onAccent, fontSize: 10, fontWeight: '800' }}>
            {unread > 9 ? '9+' : unread}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

function AnimatedTabIcon({
  name,
  color,
  size,
  focused,
}: {
  name: keyof typeof Ionicons.glyphMap;
  color: ColorValue;
  size: number;
  focused: boolean;
}) {
  const bounce = useTabIconBounce(focused);
  return (
    <Animated.View style={bounce}>
      <Ionicons name={name} color={color as string} size={size} />
    </Animated.View>
  );
}

export default function TabsLayout() {
  const { user, loading } = useAuth();
  const { t } = useT();
  const { colors, resolved } = useTheme();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }
  if (!user) return <Redirect href="/login" />;

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTitleStyle: { fontFamily: fonts.displaySemibold, fontSize: 18, color: colors.ink },
        headerShadowVisible: false,
        headerLeft: () => <NotificationBell />,
        // Isotipo de marca (monocromo caramelo; en oscuro, variante blanca según brand.md).
        // Grande a propósito: es la única marca visible en el 90% de las pantallas de la
        // app (las demás son listas de trabajo), así que gana presencia sobre pasar
        // desapercibida a 26px.
        headerRight: () => (
          <Image
            source={require('../../../assets/images/brand/icon-brand.svg')}
            style={{ width: 42, height: 42, marginRight: 14 }}
            contentFit="contain"
            tintColor={resolved === 'dark' ? colors.onAccent : undefined}
          />
        ),
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.inkSoft,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.hairline,
          shadowColor: colors.shadow,
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 1,
          shadowRadius: 8,
          elevation: 8,
        },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('tabs.rooms'),
          tabBarIcon: ({ color, size, focused }) => (
            <AnimatedTabIcon name="bed-outline" color={color} size={size} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="dashboard"
        options={{
          title: t('tabs.dashboard'),
          tabBarIcon: ({ color, size, focused }) => (
            <AnimatedTabIcon name="speedometer-outline" color={color} size={size} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="tareas"
        options={{
          // El empleado ve las suyas; de líder para arriba, el tablón del área.
          title: isAtLeast(user, 'jefe') ? t('tabs.tasks') : t('tabs.myTasks'),
          tabBarIcon: ({ color, size, focused }) => (
            <AnimatedTabIcon name="checkbox-outline" color={color} size={size} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="revision"
        options={{
          title: t('tabs.review'),
          // Revisar es potestad del mando: para el empleado la pestaña no existe.
          href: isAtLeast(user, 'jefe') ? undefined : null,
          tabBarIcon: ({ color, size, focused }) => (
            <AnimatedTabIcon name="shield-checkmark-outline" color={color} size={size} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="incidencias"
        options={{
          title: t('tabs.incidents'),
          tabBarIcon: ({ color, size, focused }) => (
            <AnimatedTabIcon name="warning-outline" color={color} size={size} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="perfil"
        options={{
          title: t('tabs.profile'),
          tabBarIcon: ({ color, size, focused }) => (
            <AnimatedTabIcon name="person-circle-outline" color={color} size={size} focused={focused} />
          ),
        }}
      />
    </Tabs>
  );
}
