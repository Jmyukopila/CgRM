import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ImageStyle,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import Animated from 'react-native-reanimated';
import { AnimatedPressable, Button, cardShadow, Empty, ErrorState, Pill, Screen, Skeleton, notify } from '../../components/ui';
import { api, type Room, type RoomStatus } from '../../lib/api';
import { useRoomStatusMeta, useRoomTypeLabels, useT } from '../../lib/i18n';
import { useFadeSlideIn, useStaggerDelay } from '../../lib/motion';
import { useAuth } from '../../lib/auth';
import { canManageStays, canSetRoomStatus, ROOM_FLOW } from '../../lib/permissions';
import { roomIcon, roomPhoto } from '../../lib/room-photos';
import { fonts, radius, typeScale, type Colors } from '../../lib/theme';
import { useThemedStyles, useTheme } from '../../lib/theme-context';
import { groupByFloor } from '../../lib/utils';

const FILTERS = ['todas', 'sucia', 'en_limpieza', 'pendiente_inspeccion', 'lista', 'ocupada', 'bloqueada'];

function RoomCard({
  room,
  index,
  meta,
  typeLabel,
  onLongPress,
}: {
  room: Room;
  index: number;
  meta: { label: string; color: string; soft: string };
  typeLabel: string;
  onLongPress: () => void;
}) {
  const { colors } = useTheme();
  const s = useThemedStyles(makeStyles);
  const fade = useFadeSlideIn(useStaggerDelay(index));
  const photo = roomPhoto(room);
  return (
    <Animated.View style={[s.cardWrap, fade]}>
      <AnimatedPressable onPress={() => router.push(`/room/${room.id}`)} onLongPress={onLongPress} style={s.card}>
        <View>
          {photo ? (
            <Image source={photo} style={s.cardPhoto} contentFit="cover" transition={150} />
          ) : (
            // Sitio sin foto real (Cocina, Lavandería): icono del oficio antes que la
            // foto de otro sitio, que sería mentir sobre lo que se está mirando.
            <View style={[s.cardPhoto, s.cardPhotoEmpty]}>
              <Ionicons name={roomIcon(room)} size={40} color={colors.inkFaint} />
            </View>
          )}
          {/* Velo de abajo hacia arriba: la ficha (nombre + estado) se lee como el pie
              de foto de un dossier de habitaciones, no como una tarjeta de app suelta. */}
          <LinearGradient colors={['transparent', colors.overlay]} style={s.photoGradient} />
          {(room.open_incidents > 0 || room.open_tasks > 0 || room.stay_id) && (
            <View style={s.cardBadges}>
              {!!room.stay_id && (
                <View style={s.badge}>
                  <Ionicons name="person" size={13} color={s.inkSoftIcon.color as string} />
                </View>
              )}
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
  const { user } = useAuth();
  const { colors } = useTheme();
  const s = useThemedStyles(makeStyles);
  const roomStatus = useRoomStatusMeta();
  const roomType = useRoomTypeLabels();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState('todas');
  const [refreshing, setRefreshing] = useState(false);
  const [activeRoom, setActiveRoom] = useState<Room | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

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

  const roomActions = activeRoom ? ROOM_FLOW[activeRoom.status].filter((next) => canSetRoomStatus(user, activeRoom, next)) : [];

  const setStatus = async (next: RoomStatus) => {
    if (!activeRoom) return;
    setActionBusy(true);
    try {
      await api.patch(`/api/rooms/${activeRoom.id}`, { status: next });
      setActiveRoom(null);
      await load();
    } catch (e: any) {
      notify(t('common.error'), e.message);
    } finally {
      setActionBusy(false);
    }
  };

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
                <RoomCard
                  key={room.id}
                  room={room}
                  index={i}
                  meta={roomStatus[room.status]}
                  typeLabel={roomType[room.type]}
                  onLongPress={() => setActiveRoom(room)}
                />
              ))}
            </View>
          </View>
        ))}
      </ScrollView>

      <Modal visible={!!activeRoom} transparent animationType="fade" onRequestClose={() => setActiveRoom(null)}>
        <Pressable style={s.sheetBackdrop} onPress={() => setActiveRoom(null)}>
          <Pressable style={s.sheetCard} onPress={() => {}}>
            {activeRoom && (
              <>
                <Text style={s.sheetTitle}>{activeRoom.name}</Text>
                <Text style={s.sheetSubtitle}>{roomStatus[activeRoom.status].label}</Text>
                <View style={s.sheetActions}>
                  {roomActions.map((next) => (
                    <Pressable
                      key={next}
                      disabled={actionBusy}
                      onPress={() => setStatus(next)}
                      style={[s.sheetChip, { opacity: actionBusy ? 0.6 : 1 }]}
                    >
                      <Text style={s.sheetChipText}>{t('roomAction.to', { status: roomStatus[next].label })}</Text>
                    </Pressable>
                  ))}
                </View>
                {canManageStays(user) && (
                  <View style={{ marginTop: 12 }}>
                    <Button
                      label={t('roomAction.openRoom')}
                      kind="ghost"
                      onPress={() => {
                        const id = activeRoom.id;
                        setActiveRoom(null);
                        router.push(`/room/${id}`);
                      }}
                    />
                  </View>
                )}
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
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
    cardPhotoEmpty: {
      backgroundColor: colors.surfaceSunken,
      alignItems: 'center',
      justifyContent: 'center',
    } as ViewStyle,
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
    sheetBackdrop: {
      flex: 1,
      backgroundColor: colors.overlay,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
    } as ViewStyle,
    sheetCard: {
      width: '100%',
      backgroundColor: colors.bg,
      borderRadius: radius.lg,
      padding: 20,
      ...cardShadow(colors),
    } as ViewStyle,
    sheetTitle: { ...typeScale.heading, color: colors.ink } as TextStyle,
    sheetSubtitle: { ...typeScale.caption, color: colors.inkSoft, marginTop: 2, marginBottom: 12 } as TextStyle,
    sheetActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 } as ViewStyle,
    sheetChip: {
      minHeight: 44,
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.hairlineStrong,
      borderRadius: radius.pill,
      paddingHorizontal: 14,
      backgroundColor: colors.surface,
    } as ViewStyle,
    sheetChipText: { fontFamily: fonts.uiBold, fontSize: 13, color: colors.ink } as TextStyle,
  };
}
