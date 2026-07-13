import { useNavigation } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button, Empty, Pill, SectionTitle, notify } from '../components/ui';
import { api, type LostItem, type Room } from '../lib/api';
import { useLostStatusMeta, useT } from '../lib/i18n';
import { colors } from '../lib/theme';

export default function ObjetosPerdidos() {
  const navigation = useNavigation();
  const { t } = useT();
  const lostStatus = useLostStatusMeta();
  const [items, setItems] = useState<LostItem[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [description, setDescription] = useState('');
  const [roomId, setRoomId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    navigation.setOptions({ title: t('lost.title') });
  }, [navigation, t]);

  const load = useCallback(async () => {
    try {
      const q = showAll ? '' : '?status=abiertos';
      setItems(await api.get<LostItem[]>(`/api/lost-items${q}`));
    } catch {
      // reintento manual
    }
  }, [showAll]);

  useEffect(() => {
    load();
    api.get<Room[]>('/api/rooms').then(setRooms).catch(() => {});
  }, [load]);

  const create = async () => {
    if (!description.trim()) return;
    setCreating(true);
    try {
      await api.post('/api/lost-items', { description: description.trim(), room_id: roomId });
      setDescription('');
      setRoomId(null);
      await load();
    } catch (e: any) {
      notify(t('common.error'), e.message);
    } finally {
      setCreating(false);
    }
  };

  const updateStatus = async (item: LostItem, status: LostItem['status']) => {
    try {
      await api.patch(`/api/lost-items/${item.id}`, { status });
      await load();
    } catch (e: any) {
      notify(t('common.error'), e.message);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <SectionTitle>{t('lost.new')}</SectionTitle>
      <View style={styles.form}>
        <TextInput
          style={styles.input}
          placeholder={t('lost.descriptionPlaceholder')}
          placeholderTextColor={colors.inkSoft}
          value={description}
          onChangeText={setDescription}
        />
        <Text style={styles.label}>{t('lost.room')}</Text>
        <View style={styles.chips}>
          <Pressable
            onPress={() => setRoomId(null)}
            style={[styles.chip, roomId === null && styles.chipActive]}
          >
            <Text style={[styles.chipText, roomId === null && { color: '#fff' }]}>{t('common.optional')}</Text>
          </Pressable>
          {rooms.map((r) => (
            <Pressable
              key={r.id}
              onPress={() => setRoomId(r.id)}
              style={[styles.chip, roomId === r.id && styles.chipActive]}
            >
              <Text style={[styles.chipText, roomId === r.id && { color: '#fff' }]}>{r.name}</Text>
            </Pressable>
          ))}
        </View>
        <Button label={t('lost.new')} onPress={create} loading={creating} disabled={!description.trim()} />
      </View>

      <Pressable onPress={() => setShowAll((v) => !v)} style={styles.toggle}>
        <Text style={styles.toggleText}>{showAll ? t('lost.showAll') : t('lost.showOpen')}</Text>
      </Pressable>

      {items.length === 0 && <Empty text={t('lost.empty')} />}
      {items.map((item) => {
        const meta = lostStatus[item.status];
        return (
          <View key={item.id} style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.desc}>{item.description}</Text>
              <Pill label={meta.label} color={meta.color} soft={meta.soft} />
            </View>
            <Text style={styles.meta}>
              {item.room_name ?? '—'} · {t('lost.foundBy')} {item.found_by_name}
            </Text>
            {item.claimant ? <Text style={styles.meta}>{t('lost.claimant')}: {item.claimant}</Text> : null}
            {item.status !== 'entregado' && (
              <View style={styles.actions}>
                {item.status === 'guardado' && (
                  <Button
                    label={t('lost.markClaimed')}
                    kind="ghost"
                    onPress={() => updateStatus(item, 'reclamado')}
                  />
                )}
                <Button label={t('lost.markDelivered')} onPress={() => updateStatus(item, 'entregado')} />
              </View>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  form: { gap: 10 },
  label: { fontSize: 13, fontWeight: '700', color: colors.inkSoft, marginTop: 4 },
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
  toggle: { paddingVertical: 12, marginTop: 8 },
  toggleText: { fontSize: 12, color: colors.inkSoft, fontWeight: '600' },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
    gap: 4,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  desc: { fontSize: 15, fontWeight: '700', color: colors.ink, flex: 1 },
  meta: { fontSize: 12, color: colors.inkSoft },
  actions: { flexDirection: 'row', gap: 8, marginTop: 8 },
});
