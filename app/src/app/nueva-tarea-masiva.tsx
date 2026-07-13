import { router, useNavigation } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, SectionTitle, notify } from '../components/ui';
import { api, type Room } from '../lib/api';
import { useAuth } from '../lib/auth';
import { usePriorityMeta, useT, useTaskTypeLabels } from '../lib/i18n';
import { AREA_OF_TYPE, canSupervise } from '../lib/permissions';
import { colors } from '../lib/theme';

const TASK_TYPES = ['limpieza', 'inspeccion', 'mantenimiento', 'recepcion', 'cocina', 'lavanderia'];

export default function NuevaTareaMasiva() {
  const navigation = useNavigation();
  const { t } = useT();
  const { user } = useAuth();
  const priority = usePriorityMeta();
  const taskType = useTaskTypeLabels();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  // Solo el trabajo de las áreas que uno supervisa.
  const creatableTypes = TASK_TYPES.filter((k) => canSupervise(user, AREA_OF_TYPE[k]));
  const [type, setType] = useState<string>(creatableTypes[0] ?? 'limpieza');
  const [prio, setPrio] = useState('media');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    navigation.setOptions({ title: t('bulk.title') });
  }, [navigation, t]);

  useEffect(() => {
    api.get<Room[]>('/api/rooms').then(setRooms).catch(() => {});
  }, []);

  const byFloor = useMemo(() => {
    const groups = new Map<string, Room[]>();
    for (const r of rooms) {
      if (!groups.has(r.floor)) groups.set(r.floor, []);
      groups.get(r.floor)!.push(r);
    }
    return [...groups.entries()];
  }, [rooms]);

  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleFloor = (floorRooms: Room[]) => {
    const allSelected = floorRooms.every((r) => selected.has(r.id));
    setSelected((prev) => {
      const next = new Set(prev);
      for (const r of floorRooms) {
        if (allSelected) next.delete(r.id);
        else next.add(r.id);
      }
      return next;
    });
  };

  const submit = async () => {
    if (selected.size === 0) {
      notify(t('bulk.missingTitle'), t('bulk.missingBody'));
      return;
    }
    setCreating(true);
    try {
      await api.post('/api/tasks', { room_ids: [...selected], type, priority: prio });
      if (router.canGoBack()) router.back();
      else router.replace('/(tabs)/tareas');
    } catch (e: any) {
      notify(t('common.error'), e.message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <SectionTitle>{t('room.newTask')}</SectionTitle>
      <View style={styles.chips}>
        {creatableTypes.map((k) => (
          <Pressable
            key={k}
            onPress={() => setType(k)}
            style={[styles.chip, type === k && styles.chipActive]}
          >
            <Text style={[styles.chipText, type === k && { color: '#fff' }]}>{taskType[k]}</Text>
          </Pressable>
        ))}
      </View>

      <SectionTitle>{t('newIncident.priority')}</SectionTitle>
      <View style={styles.chips}>
        {Object.entries(priority).map(([key, p]) => (
          <Pressable
            key={key}
            onPress={() => setPrio(key)}
            style={[styles.chip, prio === key && { backgroundColor: p.color, borderColor: 'transparent' }]}
          >
            <Text style={[styles.chipText, prio === key && { color: '#fff' }]}>{p.label}</Text>
          </Pressable>
        ))}
      </View>

      <SectionTitle>{`${t('bulk.rooms')} · ${t('bulk.selectedCount', { n: selected.size })}`}</SectionTitle>
      {byFloor.map(([floor, list]) => {
        const allSelected = list.every((r) => selected.has(r.id));
        return (
          <View key={floor} style={{ marginBottom: 10 }}>
            <Pressable onPress={() => toggleFloor(list)} style={styles.floorHeader}>
              <Text style={styles.floorTitle}>{floor}</Text>
              <Text style={styles.floorAction}>{allSelected ? t('bulk.deselectAll') : t('bulk.selectAll')}</Text>
            </Pressable>
            <View style={styles.chips}>
              {list.map((r) => (
                <Pressable
                  key={r.id}
                  onPress={() => toggle(r.id)}
                  style={[styles.chip, selected.has(r.id) && styles.chipActive]}
                >
                  <Text style={[styles.chipText, selected.has(r.id) && { color: '#fff' }]}>{r.name}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        );
      })}

      <View style={{ marginTop: 16 }}>
        <Button
          label={t('bulk.submit', { n: selected.size })}
          onPress={submit}
          loading={creating}
          disabled={selected.size === 0}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
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
  floorHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  floorTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.inkSoft,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  floorAction: { fontSize: 12, fontWeight: '700', color: colors.accent },
});
