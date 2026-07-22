import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, TextStyle, View, ViewStyle } from 'react-native';
import { AnimatedPressable, Avatar, Button, Card, confirmAction, notify, Screen, SegmentedControl } from '../../components/ui';
import { api, API_URL } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useAreaLabels, useT, type Lang } from '../../lib/i18n';
import { canManageOps, isAtLeast } from '../../lib/permissions';
import { roleColor, type Colors } from '../../lib/theme';
import { type ThemePreference, useThemedStyles, useTheme } from '../../lib/theme-context';

const GENERAL_LINKS = [
  { href: '/objetos-perdidos', key: 'profile.lostItems' as const, icon: 'search-outline' as const },
];
const SUPERVISOR_LINKS = [
  { href: '/programadas', key: 'schedules.title' as const, icon: 'repeat-outline' as const },
];
const ADMIN_LINKS = [
  { href: '/inventario', key: 'profile.inventory' as const, icon: 'cube-outline' as const },
  { href: '/usuarios', key: 'profile.users' as const, icon: 'people-outline' as const },
  { href: '/reportes', key: 'profile.reports' as const, icon: 'bar-chart-outline' as const },
];

export default function Perfil() {
  const { user, logout, clockedIn, setClockedIn } = useAuth();
  const { t, lang, setLang } = useT();
  const { colors, preference, setPreference } = useTheme();
  const areas = useAreaLabels();
  const s = useThemedStyles(makeStyles);
  const [busy, setBusy] = useState(false);
  const [shiftBusy, setShiftBusy] = useState(false);

  if (!user) return null;

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString(lang === 'es' ? 'es-CO' : 'en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });

  const startShift = async () => {
    const ok = await confirmAction(
      t('profile.startShiftConfirmTitle'),
      t('profile.startShiftConfirmBody'),
      t('profile.startShift'),
      t('common.cancel')
    );
    if (!ok) return;
    setShiftBusy(true);
    try {
      const log = await api.post<{ ended_at: string }>('/api/shift/start', {});
      setClockedIn(true);
      notify(t('profile.startShiftDone'), t('profile.startShiftDoneBody', { time: formatTime(log.ended_at) }));
    } catch (e: any) {
      notify(t('common.error'), e.message);
    } finally {
      setShiftBusy(false);
    }
  };

  const endShift = async () => {
    const ok = await confirmAction(
      t('profile.endShiftConfirmTitle'),
      t('profile.endShiftConfirmBody'),
      t('profile.endShift'),
      t('common.cancel')
    );
    if (!ok) return;
    setShiftBusy(true);
    try {
      const log = await api.post<{ ended_at: string }>('/api/shift/end', {});
      setClockedIn(false);
      notify(t('profile.endShiftDone'), t('profile.endShiftDoneBody', { time: formatTime(log.ended_at) }));
    } catch (e: any) {
      notify(t('common.error'), e.message);
    } finally {
      setShiftBusy(false);
    }
  };

  return (
    <Screen slideFrom="down">
      <ScrollView style={s.screen} contentContainerStyle={s.content}>
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

        {isAtLeast(user, 'jefe') && (
          <Card style={{ padding: 4 }}>
            {SUPERVISOR_LINKS.map((link) => (
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

        {user.role === 'empleado' &&
          (clockedIn ? (
            <Button
              label={t('profile.endShift')}
              kind="ghost"
              icon="log-out-outline"
              loading={shiftBusy}
              onPress={endShift}
            />
          ) : (
            <Button
              label={t('profile.startShift')}
              kind="ghost"
              icon="log-in-outline"
              loading={shiftBusy}
              onPress={startShift}
            />
          ))}

        <Button
          label={t('profile.logout')}
          kind="danger"
          loading={busy}
          onPress={async () => {
            setBusy(true);
            await logout();
          }}
        />
      </ScrollView>
    </Screen>
  );
}

function makeStyles(colors: Colors) {
  return {
    screen: { flex: 1 } as ViewStyle,
    content: { padding: 16, paddingBottom: 32, gap: 16 } as ViewStyle,
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
