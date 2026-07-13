import { useNavigation } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button, Empty, SectionTitle, notify } from '../components/ui';
import { api, type Area, type Role, type User } from '../lib/api';
import { useAreaLabels, useT } from '../lib/i18n';
import { useAuth } from '../lib/auth';
import { AREAS, ROLES, canGrantRole } from '../lib/permissions';
import { colors } from '../lib/theme';

// Solo empleado y líder viven en un área; el jefe y el admin las cruzan todas.
const NEEDS_AREA = (role: Role) => role === 'empleado' || role === 'lider';

export default function Usuarios() {
  const navigation = useNavigation();
  const { t } = useT();
  const { user: me } = useAuth();
  const areaLabels = useAreaLabels();
  const [users, setUsers] = useState<User[]>([]);
  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('empleado');
  const [area, setArea] = useState<Area>('limpieza');
  const [creating, setCreating] = useState(false);

  // Un jefe da de alta a su gente; fabricar jefes y admins es cosa del administrador.
  const grantableRoles = ROLES.filter((r) => canGrantRole(me, r));

  useEffect(() => {
    navigation.setOptions({ title: t('users.title') });
  }, [navigation, t]);

  const load = () => api.get<User[]>('/api/users').then(setUsers).catch(() => {});

  useEffect(() => {
    load();
  }, []);

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

  const deactivate = async (u: User) => {
    try {
      await api.patch(`/api/users/${u.id}`, { active: false });
      await load();
    } catch (e: any) {
      notify(t('common.error'), e.message);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <SectionTitle>{t('users.new')}</SectionTitle>
      <View style={styles.form}>
        <TextInput
          style={styles.input}
          placeholder={t('users.username')}
          placeholderTextColor={colors.inkSoft}
          autoCapitalize="none"
          value={username}
          onChangeText={setUsername}
        />
        <TextInput
          style={styles.input}
          placeholder={t('users.name')}
          placeholderTextColor={colors.inkSoft}
          value={name}
          onChangeText={setName}
        />
        <TextInput
          style={styles.input}
          placeholder={t('users.password')}
          placeholderTextColor={colors.inkSoft}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />
        <Text style={styles.fieldLabel}>{t('users.role')}</Text>
        <View style={styles.chips}>
          {grantableRoles.map((r) => (
            <Pressable key={r} onPress={() => setRole(r)} style={[styles.chip, role === r && styles.chipActive]}>
              <Text style={[styles.chipText, role === r && { color: '#fff' }]}>{t(`role.${r}` as any)}</Text>
            </Pressable>
          ))}
        </View>

        {NEEDS_AREA(role) && (
          <>
            <Text style={styles.fieldLabel}>{t('users.area')}</Text>
            <View style={styles.chips}>
              {AREAS.map((a) => (
                <Pressable
                  key={a}
                  onPress={() => setArea(a)}
                  style={[styles.chip, area === a && styles.chipActive]}
                >
                  <Text style={[styles.chipText, area === a && { color: '#fff' }]}>{areaLabels[a]}</Text>
                </Pressable>
              ))}
            </View>
          </>
        )}
        <Text style={styles.hint}>{t('users.areaHint')}</Text>

        <Button
          label={t('common.create')}
          onPress={create}
          loading={creating}
          disabled={!username.trim() || !name.trim() || !password}
        />
      </View>

      <SectionTitle>{t('users.title')}</SectionTitle>
      {users.length === 0 && <Empty text={t('users.empty')} />}
      {users.map((u) => (
        <View key={u.id} style={styles.card}>
          <View style={{ flex: 1 }}>
            <Text style={styles.userName}>{u.name}</Text>
            <Text style={styles.meta}>
              {u.username} · {t(`role.${u.role}` as any)}
              {u.area ? ` · ${areaLabels[u.area]}` : ''}
            </Text>
          </View>
          {/* Un jefe no puede desactivar a un admin: el servidor lo rechazaría igual. */}
          {canGrantRole(me, u.role) && u.id !== me?.id && (
            <Button label={t('users.deactivate')} kind="danger" onPress={() => deactivate(u)} />
          )}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  form: { gap: 10, marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 10,
    minHeight: 48,
    paddingHorizontal: 14,
    fontSize: 16,
    color: colors.ink,
    backgroundColor: colors.surface,
  },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: colors.inkSoft, marginTop: 4 },
  hint: { fontSize: 12, color: colors.inkFaint, lineHeight: 17 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.surface,
  },
  chipActive: { backgroundColor: colors.ink, borderColor: 'transparent' },
  chipText: { fontSize: 13, fontWeight: '700', color: colors.ink },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  userName: { fontSize: 15, fontWeight: '700', color: colors.ink },
  meta: { fontSize: 12, color: colors.inkSoft },
});
