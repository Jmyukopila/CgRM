import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Redirect, Tabs } from 'expo-router';
import { ActivityIndicator, View, type ColorValue } from 'react-native';
import Animated from 'react-native-reanimated';
import { useAuth } from '../../lib/auth';
import { useT } from '../../lib/i18n';
import { useTabIconBounce } from '../../lib/motion';
import { isAtLeast } from '../../lib/permissions';
import { fonts } from '../../lib/theme';
import { useTheme } from '../../lib/theme-context';

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
        // Isotipo de marca (monocromo caramelo; en oscuro, variante blanca según brand.md).
        headerRight: () => (
          <Image
            source={require('../../../assets/images/brand/icon-brand.svg')}
            style={{ width: 26, height: 26, marginRight: 16 }}
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
        name="tareas"
        options={{
          // El empleado ve las suyas; de líder para arriba, el tablón del área.
          title: isAtLeast(user, 'lider') ? t('tabs.tasks') : t('tabs.myTasks'),
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
          href: isAtLeast(user, 'lider') ? undefined : null,
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
