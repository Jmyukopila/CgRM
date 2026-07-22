import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, TextStyle, View, ViewStyle } from 'react-native';
import { Avatar, Button, Card, Chip, Empty, ErrorState, Screen, SectionTitle, Skeleton, notify } from '../components/ui';
import { api, type Area, type User } from '../lib/api';
import { useAreaLabels, useT } from '../lib/i18n';
import { useAuth } from '../lib/auth';
import { AREAS, canGrantRole } from '../lib/permissions';
import { radius, roleColor, type Colors } from '../lib/theme';
import { useThemedStyles, useTheme } from '../lib/theme-context';

function emptyForm() {
  return { username: '', name: '', password: '', area: 'limpieza' as Area };
}

export default function Usuarios() {
  const navigation = useNavigation();
  const { t } = useT();
  const { user: me } = useAuth();
  const { colors } = useTheme();
  const s = useThemedStyles(makeStyles);
  const areaLabels = useAreaLabels();
  const [users, setUsers] = useState<User[]>([]);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [creating, setCreating] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

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

  const openModal = () => {
    setForm(emptyForm());
    setOpen(true);
  };

  const create = async () => {
    if (!form.username.trim() || !form.name.trim() || !form.password) return;
    setCreating(true);
    try {
      await api.post('/api/users', {
        username: form.username.trim(),
        name: form.name.trim(),
        password: form.password,
        area: form.area,
      });
      setOpen(false);
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

  // Búsqueda por nombre o usuario, agrupado por área (jefe/admin no tienen una y
  // caen en un grupo aparte al principio).
  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? users.filter((u) => u.name.toLowerCase().includes(q) || u.username.toLowerCase().includes(q))
      : users;
    const groups = new Map<string, User[]>();
    for (const u of filtered) {
      const key = u.area ?? '—';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(u);
    }
    return [...groups.entries()];
  }, [users, query]);

  if (!loaded) {
    return (
      <Screen>
        <View style={{ padding: 16, gap: 10 }}>
          <Skeleton variant="card" height={64} />
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
      <View style={s.screen}>
        <View style={s.headerRow}>
          <View style={s.searchRow}>
            <Ionicons name="search-outline" size={16} color={colors.inkFaint} />
            <TextInput
              style={s.searchInput}
              value={query}
              onChangeText={setQuery}
              placeholder={t('users.search')}
              placeholderTextColor={colors.inkFaint}
              autoCapitalize="none"
            />
          </View>
          <Button label={t('users.new')} icon="person-add-outline" onPress={openModal} />
        </View>
        <Pressable onPress={() => setShowInactive((v) => !v)} style={s.toggle} hitSlop={8}>
          <Text style={s.toggleText}>{showInactive ? t('users.showActive') : t('users.showAll')}</Text>
        </Pressable>

        {users.length === 0 ? (
          <Empty text={t('users.empty')} />
        ) : (
          <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 0, gap: 4 }}>
            {grouped.map(([area, list]) => (
              <View key={area}>
                <SectionTitle>{area === '—' ? t('users.noArea') : areaLabels[area as Area]}</SectionTitle>
                {list.map((u) => (
                  <Card key={u.id} style={[s.card, !u.active && s.cardInactive]}>
                    <Avatar name={u.name} color={u.active ? roleColor(colors, u.role) : colors.inkFaint} size={40} />
                    <View style={{ flex: 1 }}>
                      <Text style={s.userName}>{u.name}</Text>
                      <Text style={s.meta}>
                        @{u.username} · {t(`role.${u.role}` as any)}
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
              </View>
            ))}
          </ScrollView>
        )}
      </View>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={s.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={s.panel} onPress={() => {}}>
            <Text style={s.panelTitle}>{t('users.new')}</Text>
            <View style={{ gap: 10 }}>
              <TextInput
                style={s.input}
                placeholder={t('users.username')}
                placeholderTextColor={colors.inkFaint}
                autoCapitalize="none"
                value={form.username}
                onChangeText={(v) => setForm((f) => ({ ...f, username: v }))}
              />
              <TextInput
                style={s.input}
                placeholder={t('users.name')}
                placeholderTextColor={colors.inkFaint}
                value={form.name}
                onChangeText={(v) => setForm((f) => ({ ...f, name: v }))}
              />
              <TextInput
                style={s.input}
                placeholder={t('users.password')}
                placeholderTextColor={colors.inkFaint}
                secureTextEntry
                value={form.password}
                onChangeText={(v) => setForm((f) => ({ ...f, password: v }))}
              />
              <Text style={s.fieldLabel}>{t('users.area')}</Text>
              <View style={s.chips}>
                {AREAS.map((a) => (
                  <Chip key={a} label={areaLabels[a]} active={form.area === a} onPress={() => setForm((f) => ({ ...f, area: a }))} />
                ))}
              </View>
              <Button
                label={t('common.create')}
                onPress={create}
                loading={creating}
                disabled={!form.username.trim() || !form.name.trim() || !form.password}
              />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

function makeStyles(colors: Colors) {
  return {
    screen: { flex: 1 } as ViewStyle,
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 16,
      paddingTop: 12,
    } as ViewStyle,
    searchRow: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      borderWidth: 1,
      borderColor: colors.hairline,
      borderRadius: radius.sm,
      paddingHorizontal: 12,
      height: 44,
      backgroundColor: colors.surfaceSunken,
    } as ViewStyle,
    searchInput: { flex: 1, fontSize: 15, color: colors.ink, padding: 0 } as TextStyle,
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
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 } as ViewStyle,
    toggle: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 16 } as ViewStyle,
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
    backdrop: {
      flex: 1,
      backgroundColor: colors.overlay,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
    } as ViewStyle,
    panel: {
      width: '100%',
      maxWidth: 400,
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      padding: 18,
    } as ViewStyle,
    panelTitle: { fontSize: 18, fontWeight: '800', color: colors.ink, marginBottom: 14 } as TextStyle,
  };
}
