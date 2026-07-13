import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { cardShadow, Empty, Pill } from '../../components/ui';
import { api, type Room } from '../../lib/api';
import { useRoomStatusMeta, useRoomTypeLabels, useT } from '../../lib/i18n';
import { colors } from '../../lib/theme';

const FILTERS = ['todas', 'sucia', 'en_limpieza', 'pendiente_inspeccion', 'lista', 'bloqueada'];

export default function Panel() {
  const { t } = useT();
  const roomStatus = useRoomStatusMeta();
  const roomType = useRoomTypeLabels();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [filter, setFilter] = useState('todas');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setRooms(await api.get<Room[]>('/api/rooms'));
    } catch {
      // sin conexión: se reintenta en el siguiente foco/refresco
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
      const interval = setInterval(load, 15000);
      return () => clearInterval(interval);
    }, [load])
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of rooms) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [rooms]);

  const byFloor = useMemo(() => {
    const filtered = filter === 'todas' ? rooms : rooms.filter((r) => r.status === filter);
    const groups = new Map<string, Room[]>();
    for (const r of filtered) {
      if (!groups.has(r.floor)) groups.set(r.floor, []);
      groups.get(r.floor)!.push(r);
    }
    return [...groups.entries()];
  }, [rooms, filter]);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await load();
            setRefreshing(false);
          }}
          tintColor={colors.accent}
        />
      }
    >
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
        <View style={styles.filters}>
          {FILTERS.map((f) => {
            const active = filter === f;
            const meta = roomStatus[f];
            const n = f === 'todas' ? rooms.length : (counts[f] ?? 0);
            return (
              <Pressable
                key={f}
                onPress={() => setFilter(f)}
                style={[
                  styles.filterChip,
                  active && { backgroundColor: meta?.color ?? colors.ink, borderColor: 'transparent' },
                ]}
              >
                <Text style={[styles.filterText, active && { color: '#fff' }]}>
                  {meta?.label ?? t('common.all')} · {n}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      {byFloor.length === 0 && <Empty text={t('rooms.empty')} />}

      {byFloor.map(([floor, list]) => (
        <View key={floor}>
          <Text style={styles.floor}>{floor}</Text>
          {list.map((room) => {
            const meta = roomStatus[room.status];
            return (
              <Pressable
                key={room.id}
                onPress={() => router.push(`/room/${room.id}`)}
                style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
              >
                <View style={[styles.statusBar, { backgroundColor: meta.color }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.roomName}>{room.name}</Text>
                  <Text style={styles.roomType}>{roomType[room.type]}</Text>
                </View>
                {room.open_incidents > 0 && (
                  <View style={styles.badge}>
                    <Ionicons name="warning" size={13} color={colors.danger} />
                    <Text style={styles.badgeText}>{room.open_incidents}</Text>
                  </View>
                )}
                {room.open_tasks > 0 && (
                  <View style={styles.badge}>
                    <Ionicons name="checkbox" size={13} color={colors.inkSoft} />
                    <Text style={styles.badgeText}>{room.open_tasks}</Text>
                  </View>
                )}
                <Pill label={meta.label} color={meta.color} soft={meta.soft} />
              </Pressable>
            );
          })}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  filters: { flexDirection: 'row', gap: 8 },
  filterChip: {
    borderWidth: 1,
    borderColor: colors.hairlineStrong,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.surface,
  },
  filterText: { fontSize: 13, fontWeight: '700', color: colors.ink },
  floor: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.inkSoft,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 18,
    marginBottom: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 14,
    paddingVertical: 12,
    paddingRight: 12,
    marginBottom: 10,
    ...cardShadow,
  },
  statusBar: { width: 5, alignSelf: 'stretch', marginRight: 6, borderRadius: 3, marginLeft: 4 },
  roomName: { fontSize: 20, fontWeight: '800', color: colors.ink, letterSpacing: -0.3 },
  roomType: { fontSize: 12, color: colors.inkSoft },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  badgeText: { fontSize: 13, fontWeight: '700', color: colors.inkSoft },
});
