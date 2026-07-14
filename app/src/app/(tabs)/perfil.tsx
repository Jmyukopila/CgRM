import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Text, TextStyle, View, ViewStyle } from 'react-native';
import { AnimatedPressable, Avatar, Button, Card, Screen, SegmentedControl } from '../../components/ui';
import { API_URL } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useAreaLabels, useT, type Lang } from '../../lib/i18n';
import { canManageOps, isAtLeast } from '../../lib/permissions';
import { roleColor, type Colors } from '../../lib/theme';
import { type ThemePreference, useThemedStyles, useTheme } from '../../lib/theme-context';

const GENERAL_LINKS = [
  { href: '/objetos-perdidos', key: 'profile.lostItems' as const, icon: 'search-outline' as const },
];
const LIDER_LINKS = [
  { href: '/programadas', key: 'schedules.title' as const, icon: 'repeat-outline' as const },
];
const ADMIN_LINKS = [
  { href: '/inventario', key: 'profile.inventory' as const, icon: 'cube-outline' as const },
  { href: '/usuarios', key: 'profile.users' as const, icon: 'people-outline' as const },
  { href: '/reportes', key: 'profile.reports' as const, icon: 'bar-chart-outline' as const },
];

export default function Perfil() {
  const { user, logout } = useAuth();
  const { t, lang, setLang } = useT();
  const { colors, preference, setPreference } = useTheme();
  const areas = useAreaLabels();
  const s = useThemedStyles(makeStyles);
  const [busy, setBusy] = useState(false);
  if (!user) return null;

  return (
    <Screen>
      <View style={s.screen}>
        <Card style={s.identityCard}>
          <Avatar name={user.name} color={roleColor(colors, user.role)} size={56} />
          <View style={{ flex: 1 }}>
            <Text style={s.name}>{user.name}</Text>
            <Text style={s.role}>
              {t(`role.${user.role}` as any)}
              {user.area ? ` · ${areas[user.area]}` : ''}
            </Text>
            <Text style={s.meta}>{t('users.username')}: {user.username}</Text>
            {(__DEV__ || user.role === 'admin') && (
              <Text style={s.meta}>{t('common.server')}: {API_URL}</Text>
            )}
          </View>
        </Card>

        <Card>
          <Text style={s.sectionLabel}>{t('settings.appearance')}</Text>
          <SegmentedControl<ThemePreference>
            value={preference}
            onChange={setPreference}
            options={[
              { value: 'light', label: t('settings.light'), icon: 'sunny-outline' },
              { value: 'dark', label: t('settings.dark'), icon: 'moon-outline' },
              { value: 'system', label: t('settings.system'), icon: 'phone-portrait-outline' },
            ]}
          />
        </Card>

        <Card>
          <Text style={s.sectionLabel}>{t('common.language')}</Text>
          <SegmentedControl<Lang>
            value={lang}
            onChange={setLang}
            options={[
              { value: 'es', label: 'Español' },
              { value: 'en', label: 'English' },
            ]}
          />
        </Card>

        <Card style={{ padding: 4 }}>
          {GENERAL_LINKS.map((link) => (
            <AnimatedPressable key={link.href} onPress={() => router.push(link.href as any)} style={s.linkRow}>
              <Ionicons name={link.icon} size={18} color={colors.inkSoft} />
              <Text style={s.linkText}>{t(link.key)}</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.inkFaint} />
            </AnimatedPressable>
          ))}
        </Card>

        {isAtLeast(user, 'lider') && (
          <Card style={{ padding: 4 }}>
            {LIDER_LINKS.map((link) => (
              <AnimatedPressable key={link.href} onPress={() => router.push(link.href as any)} style={s.linkRow}>
                <Ionicons name={link.icon} size={18} color={colors.inkSoft} />
                <Text style={s.linkText}>{t(link.key)}</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.inkFaint} />
              </AnimatedPressable>
            ))}
          </Card>
        )}

        {canManageOps(user) && (
          <Card style={{ padding: 4 }}>
            <Text style={[s.sectionLabel, { paddingHorizontal: 12, paddingTop: 8 }]}>{t('profile.admin')}</Text>
            {ADMIN_LINKS.map((link) => (
              <AnimatedPressable key={link.href} onPress={() => router.push(link.href as any)} style={s.linkRow}>
                <Ionicons name={link.icon} size={18} color={colors.inkSoft} />
                <Text style={s.linkText}>{t(link.key)}</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.inkFaint} />
              </AnimatedPressable>
            ))}
          </Card>
        )}

        <Button
          label={t('profile.logout')}
          kind="danger"
          loading={busy}
          onPress={async () => {
            setBusy(true);
            await logout();
          }}
        />
      </View>
    </Screen>
  );
}

function makeStyles(colors: Colors) {
  return {
    screen: { flex: 1, padding: 16, gap: 16 } as ViewStyle,
    identityCard: { flexDirection: 'row', alignItems: 'center', gap: 14 } as ViewStyle,
    name: { fontSize: 20, fontWeight: '800', color: colors.ink } as TextStyle,
    role: { fontSize: 13, fontWeight: '600', color: colors.accent, marginTop: 2, marginBottom: 4 } as TextStyle,
    meta: { fontSize: 12, color: colors.inkSoft } as TextStyle,
    sectionLabel: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.inkSoft,
      textTransform: 'uppercase',
      letterSpacing: 1,
      marginBottom: 8,
    } as TextStyle,
    linkRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 12,
      paddingHorizontal: 12,
      borderTopWidth: 1,
      borderTopColor: colors.hairline,
    } as ViewStyle,
    linkText: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.ink } as TextStyle,
  };
}
