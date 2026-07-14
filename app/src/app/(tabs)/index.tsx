import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ImageStyle, Pressable, RefreshControl, ScrollView, Text, TextStyle, View, ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';
import { AnimatedPressable, cardShadow, Empty, ErrorState, Pill, Screen, Skeleton } from '../../components/ui';
import { api, type Room } from '../../lib/api';
import { useRoomStatusMeta, useRoomTypeLabels, useT } from '../../lib/i18n';
import { useFadeSlideIn, useStaggerDelay } from '../../lib/motion';
import { fonts, radius, typeScale, type Colors } from '../../lib/theme';
import { useThemedStyles, useTheme } from '../../lib/theme-context';
import { groupByFloor } from '../../lib/utils';

const FILTERS = ['todas', 'sucia', 'en_limpieza', 'pendiente_inspeccion', 'lista', 'bloqueada'];

// Ocho fotos genéricas del hotel, sin mapeo real por habitación: se asigna por
// id módulo 8 para que cada habitación conserve siempre la misma foto entre
// renders y sesiones, y la rotación aguante más habitaciones que fotos.
const ROOM_PHOTOS = [
  require('../../../assets/images/rooms/room-1.jpg'),
  require('../../../assets/images/rooms/room-2.jpg'),
  require('../../../assets/images/rooms/room-3.jpg'),
  require('../../../assets/images/rooms/room-4.jpg'),
  require('../../../assets/images/rooms/room-5.jpg'),
  require('../../../assets/images/rooms/room-6.jpg'),
  require('../../../assets/images/rooms/room-7.jpg'),
  require('../../../assets/images/rooms/room-8.jpg'),
];
const photoFor = (room: Room) => ROOM_PHOTOS[room.id % ROOM_PHOTOS.length];

function RoomCard({
  room,
  index,
  meta,
  typeLabel,
}: {
  room: Room;
  index: number;
  meta: { label: string; color: string; soft: string };
  typeLabel: string;
}) {
  const { colors } = useTheme();
  const s = useThemedStyles(makeStyles);
  const fade = useFadeSlideIn(useStaggerDelay(index));
  return (
    <Animated.View style={[s.cardWrap, fade]}>
      <AnimatedPressable onPress={() => router.push(`/room/${room.id}`)} style={s.card}>
        <View>
          <Image source={photoFor(room)} style={s.cardPhoto} contentFit="cover" transition={150} />
          {/* Velo de abajo hacia arriba: la ficha (nombre + estado) se lee como el pie
              de foto de un dossier de habitaciones, no como una tarjeta de app suelta. */}
          <LinearGradient colors={['transparent', colors.overlay]} style={s.photoGradient} />
          {(room.open_incidents > 0 || room.open_tasks > 0) && (
            <View style={s.cardBadges}>
              {room.open_incidents > 0 && (
                <View style={s.badge}>
                  <Ionicons name="warning" size={13} color={s.dangerIcon.color as string} />
                  <Text style={s.badgeText}>{room.open_incidents}</Text>
                </View>
              )}
              {room.open_tasks > 0 && (
                <View style={s.badge}>
                  <Ionicons name="checkbox" size={13} color={s.inkSoftIcon.color as string} />
                  <Text style={s.badgeText}>{room.open_tasks}</Text>
                </View>
              )}
            </View>
          )}
          <View style={s.photoCaption}>
            <Text style={s.roomName} numberOfLines={1}>{room.name}</Text>
            <Pill label={meta.label} color={meta.color} />
          </View>
        </View>
        <View style={s.cardBody}>
          <Text style={s.roomType} numberOfLines={1}>{`${typeLabel} · ${room.floor}`}</Text>
        </View>
      </AnimatedPressable>
    </Animated.View>
  );
}

export default function Panel() {
  const { t } = useT();
  const { colors } = useTheme();
  const s = useThemedStyles(makeStyles);
  const roomStatus = useRoomStatusMeta();
  const roomType = useRoomTypeLabels();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState('todas');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setRooms(await api.get<Room[]>('/api/rooms'));
      setError(false);
    } catch {
      // sin conexión: se reintenta en el siguiente foco/refresco
      setError(true);
    } finally {
      setLoaded(true);
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
    return groupByFloor(filtered);
  }, [rooms, filter]);

  return (
    <Screen>
      <ScrollView
        style={s.screen}
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
          <View style={s.filters}>
            {FILTERS.map((f) => {
              const active = filter === f;
              const meta = roomStatus[f];
              const n = f === 'todas' ? rooms.length : (counts[f] ?? 0);
              return (
                <Pressable
                  key={f}
                  onPress={() => setFilter(f)}
                  style={[s.filterChip, active && { backgroundColor: meta?.color ?? colors.ink, borderColor: 'transparent' }]}
                >
                  <Text style={[s.filterText, active && { color: meta ? colors.onAccent : colors.bg }]}>
                    {meta?.label ?? t('common.all')} · {n}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>

        {!loaded && (
          <View style={s.grid}>
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} variant="card" width="48.5%" height={196} />
            ))}
          </View>
        )}

        {loaded && error && <ErrorState text={t('common.connectionError')} retryLabel={t('common.retry')} onRetry={load} />}
        {loaded && !error && byFloor.length === 0 && <Empty text={t('rooms.empty')} />}

        {byFloor.map(([floor, list]) => (
          <View key={floor}>
            <Text style={s.floor}>{floor}</Text>
            <View style={s.grid}>
              {list.map((room, i) => (
                <RoomCard key={room.id} room={room} index={i} meta={roomStatus[room.status]} typeLabel={roomType[room.type]} />
              ))}
            </View>
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}

function makeStyles(colors: Colors) {
  return {
    screen: { flex: 1 } as ViewStyle,
    filters: { flexDirection: 'row', gap: 8 } as ViewStyle,
    filterChip: {
      borderWidth: 1,
      borderColor: colors.hairlineStrong,
      borderRadius: radius.pill,
      paddingHorizontal: 12,
      paddingVertical: 8,
      backgroundColor: colors.surface,
    } as ViewStyle,
    filterText: { ...typeScale.caption, color: colors.ink } as TextStyle,
    floor: {
      ...typeScale.label,
      color: colors.inkSoft,
      marginTop: 20,
      marginBottom: 8,
    } as TextStyle,
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      rowGap: 10,
    } as ViewStyle,
    cardWrap: { width: '48.5%' } as ViewStyle,
    card: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.hairline,
      borderRadius: radius.md,
      ...cardShadow(colors),
    } as ViewStyle,
    // Radio 13 = 14 de la tarjeta menos el borde de 1px, para que la foto no lo tape.
    cardPhoto: {
      width: '100%',
      height: 132,
      borderTopLeftRadius: radius.md - 1,
      borderTopRightRadius: radius.md - 1,
    } as ImageStyle,
    photoGradient: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      height: 64,
    } as ViewStyle,
    photoCaption: {
      position: 'absolute',
      left: 10,
      right: 10,
      bottom: 8,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-end',
      gap: 6,
    } as ViewStyle,
    cardBadges: {
      position: 'absolute',
      top: 8,
      right: 8,
      flexDirection: 'row',
      gap: 6,
    } as ViewStyle,
    cardBody: { paddingHorizontal: 10, paddingTop: 8, paddingBottom: 10 } as ViewStyle,
    roomName: { ...typeScale.heading, fontSize: 17, color: colors.onAccent, flexShrink: 1 } as TextStyle,
    roomType: { ...typeScale.caption, color: colors.inkSoft } as TextStyle,
    badge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      backgroundColor: colors.surface,
      borderRadius: radius.pill,
      paddingHorizontal: 7,
      paddingVertical: 3,
      borderWidth: 1,
      borderColor: colors.hairline,
    } as ViewStyle,
    badgeText: { fontFamily: fonts.uiBold, fontSize: 12, color: colors.inkSoft } as TextStyle,
    dangerIcon: { color: colors.danger } as TextStyle,
    inkSoftIcon: { color: colors.inkSoft } as TextStyle,
  };
}
