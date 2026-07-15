import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, TextStyle, View, ViewStyle } from 'react-native';
import { Avatar, Button, Card, Chip, Empty, ErrorState, Screen, SectionTitle, Skeleton, notify } from '../components/ui';
import { api, type Area, type Role, type User } from '../lib/api';
import { useAreaLabels, useT } from '../lib/i18n';
import { useAuth } from '../lib/auth';
import { AREAS, ROLES, canGrantRole } from '../lib/permissions';
import { roleColor, type Colors } from '../lib/theme';
import { useThemedStyles, useTheme } from '../lib/theme-context';

// Solo el empleado vive en un área; el jefe y el admin las cruzan todas.
const NEEDS_AREA = (role: Role) => role === 'empleado';

const ROLE_ICON: Record<Role, keyof typeof Ionicons.glyphMap> = {
  empleado: 'person-outline',
  jefe: 'briefcase-outline',
  admin: 'shield-outline',
};

export default function Usuarios() {
  const navigation = useNavigation();
  const { t } = useT();
  const { user: me } = useAuth();
  const { colors } = useTheme();
  const s = useThemedStyles(makeStyles);
  const areaLabels = useAreaLabels();
  const [users, setUsers] = useState<User[]>([]);
  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('empleado');
  const [area, setArea] = useState<Area>('limpieza');
  const [creating, setCreating] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  // Un jefe da de alta a su gente; fabricar jefes y admins es cosa del administrador.
  const grantableRoles = ROLES.filter((r) => canGrantRole(me, r));

  useEffect(() => {
    navigation.setOptions({ title: t('users.title') });
  }, [navigation, t]);

  const load = useCallback(
    () =>
      api
        .get<User[]>(`/api/users${showInactive ? '?include_inactive=1' : ''}`)
        .then((r) => {
          setUsers(r);
          setError(false);
        })
        .catch(() => setError(true))
        .finally(() => setLoaded(true)),
    [showInactive]
  );

  useEffect(() => {
    load();
  }, [load]);

  const create = async () => {
    if (!username.trim() || !name.trim() || !password) return;
    setCreating(true);
    try {
      await api.post('/api/users', {
        username: username.trim(),
        name: name.trim(),
        password,
        role,
        area: NEEDS_AREA(role) ? area : null,
      });
      setUsername('');
      setName('');
      setPassword('');
      await load();
    } catch (e: any) {
      notify(t('common.error'), e.message);
    } finally {
      setCreating(false);
    }
  };

  const setActive = async (u: User, active: boolean) => {
    try {
      await api.patch(`/api/users/${u.id}`, { active });
      await load();
    } catch (e: any) {
      notify(t('common.error'), e.message);
    }
  };

  if (!loaded) {
    return (
      <Screen>
        <View style={{ padding: 16, gap: 10 }}>
          <Skeleton variant="card" height={200} />
          <Skeleton variant="card" height={64} />
        </View>
      </Screen>
    );
  }

  if (error) {
    return (
      <Screen>
        <View style={{ flex: 1, justifyContent: 'center', padding: 16 }}>
          <ErrorState text={t('common.connectionError')} retryLabel={t('common.retry')} onRetry={load} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={s.screen}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
      >
        <SectionTitle>{t('users.new')}</SectionTitle>
        <View style={s.form}>
          <TextInput
            style={s.input}
            placeholder={t('users.username')}
            placeholderTextColor={colors.inkFaint}
            autoCapitalize="none"
            value={username}
            onChangeText={setUsername}
          />
          <TextInput
            style={s.input}
            placeholder={t('users.name')}
            placeholderTextColor={colors.inkFaint}
            value={name}
            onChangeText={setName}
          />
          <TextInput
            style={s.input}
            placeholder={t('users.password')}
            placeholderTextColor={colors.inkFaint}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />
          <Text style={s.fieldLabel}>{t('users.role')}</Text>
          <View style={s.chips}>
            {grantableRoles.map((r) => (
              <Pressable key={r} onPress={() => setRole(r)} style={[s.chip, role === r && s.chipActive]}>
                <Ionicons name={ROLE_ICON[r]} size={14} color={role === r ? colors.bg : colors.inkSoft} />
                <Text style={[s.chipText, role === r && { color: colors.bg }]}>{t(`role.${r}` as any)}</Text>
              </Pressable>
            ))}
          </View>

          {NEEDS_AREA(role) && (
            <>
              <Text style={s.fieldLabel}>{t('users.area')}</Text>
              <View style={s.chips}>
                {AREAS.map((a) => (
                  <Chip key={a} label={areaLabels[a]} active={area === a} onPress={() => setArea(a)} />
                ))}
              </View>
            </>
          )}
          <Text style={s.hint}>{t('users.areaHint')}</Text>

          <Button
            label={t('common.create')}
            onPress={create}
            loading={creating}
            disabled={!username.trim() || !name.trim() || !password}
          />
        </View>

        <SectionTitle>{t('users.title')}</SectionTitle>
        <Pressable onPress={() => setShowInactive((v) => !v)} style={s.toggle} hitSlop={8}>
          <Text style={s.toggleText}>{showInactive ? t('users.showActive') : t('users.showAll')}</Text>
        </Pressable>
        {users.length === 0 && <Empty text={t('users.empty')} />}
        {users.map((u) => (
          <Card key={u.id} style={[s.card, !u.active && s.cardInactive]}>
            <Avatar name={u.name} color={u.active ? roleColor(colors, u.role) : colors.inkFaint} size={40} />
            <View style={{ flex: 1 }}>
              <Text style={s.userName}>{u.name}</Text>
              <Text style={s.meta}>
                {u.username} · {t(`role.${u.role}` as any)}
                {u.area ? ` · ${areaLabels[u.area]}` : ''}
                {!u.active ? ` · ${t('users.inactive')}` : ''}
              </Text>
            </View>
            {/* Un jefe no puede desactivar ni reactivar a un admin: el servidor lo rechazaría igual. */}
            {canGrantRole(me, u.role) && u.id !== me?.id && (
              u.active ? (
                <Button label={t('users.deactivate')} kind="danger" onPress={() => setActive(u, false)} />
              ) : (
                <Button label={t('users.activate')} onPress={() => setActive(u, true)} />
              )
            )}
          </Card>
        ))}
      </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function makeStyles(colors: Colors) {
  return {
    screen: { flex: 1 } as ViewStyle,
    form: { gap: 10, marginBottom: 8 } as ViewStyle,
    input: {
      borderWidth: 1,
      borderColor: colors.hairline,
      borderRadius: 10,
      minHeight: 48,
      paddingHorizontal: 14,
      fontSize: 16,
      color: colors.ink,
      backgroundColor: colors.surface,
    } as TextStyle,
    fieldLabel: { fontSize: 12, fontWeight: '700', color: colors.inkSoft, marginTop: 4 } as TextStyle,
    hint: { fontSize: 12, color: colors.inkFaint, lineHeight: 17 } as TextStyle,
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 } as ViewStyle,
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderWidth: 1,
      borderColor: colors.hairline,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 8,
      backgroundColor: colors.surface,
    } as ViewStyle,
    chipActive: { backgroundColor: colors.ink, borderColor: 'transparent' } as ViewStyle,
    chipText: { fontSize: 13, fontWeight: '700', color: colors.ink } as TextStyle,
    toggle: { minHeight: 44, justifyContent: 'center', marginBottom: 8 } as ViewStyle,
    toggleText: { fontSize: 12, color: colors.inkSoft, fontWeight: '600' } as TextStyle,
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginBottom: 8,
    } as ViewStyle,
    cardInactive: { opacity: 0.6 } as ViewStyle,
    userName: { fontSize: 15, fontWeight: '700', color: colors.ink } as TextStyle,
    meta: { fontSize: 12, color: colors.inkSoft } as TextStyle,
  };
}
