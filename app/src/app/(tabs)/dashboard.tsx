// Panel de control: anillos de progreso por tipo de trabajo + lista de detalle.
// Jefe/admin ven el agregado de todas las áreas; empleado y líder ven solo lo suyo.
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, Text, TextStyle, View, ViewStyle } from 'react-native';
import { AnimatedPressable, Card, Empty, ErrorState, Pill, Screen, Skeleton } from '../../components/ui';
import { ProgressRing, RingLegend } from '../../components/progress-ring';
import { api, type Room, type Summary, type Task, type TaskStatus } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useRoomStatusMeta, useT, useTaskStatusMeta, useTaskTypeLabels } from '../../lib/i18n';
import { isAtLeast } from '../../lib/permissions';
import { fonts, radius, typeScale, type Colors } from '../../lib/theme';
import { useThemedStyles, useTheme } from '../../lib/theme-context';

type Bucket = { terminado: number; en_progreso: number; no_iniciado: number };

const RING_TYPES: { type: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { type: 'inspeccion', icon: 'search-outline' },
  { type: 'mantenimiento', icon: 'construct-outline' },
  { type: 'limpieza', icon: 'sparkles-outline' },
];

// El empleado/líder ve su propio trabajo (asignado o libre en su área), sin
// depender del agregado global que solo calcula el servidor para jefe/admin.
function bucketFromTasks(tasks: Task[]): Record<string, Bucket> {
  const byType: Record<string, Bucket> = {};
  for (const task of tasks) {
    const b = (byType[task.type] ??= { terminado: 0, en_progreso: 0, no_iniciado: 0 });
    if (task.status === 'hecha' || task.status === 'verificada') b.terminado++;
    else if (task.status === 'en_curso') b.en_progreso++;
    else if (task.status !== 'cancelada') b.no_iniciado++;
  }
  return byType;
}

function CategoryRing({
  type,
  icon,
  bucket,
}: {
  type: string;
  icon: keyof typeof Ionicons.glyphMap;
  bucket?: Bucket;
}) {
  const { colors } = useTheme();
  const taskType = useTaskTypeLabels();
  const t = useT().t;
  const b = bucket ?? { terminado: 0, en_progreso: 0, no_iniciado: 0 };

  return (
    <View style={{ flex: 1, alignItems: 'center', gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
        <Ionicons name={icon} size={14} color={colors.inkSoft} />
        <Text style={{ fontFamily: fonts.uiBold, fontSize: 13, color: colors.ink }}>{taskType[type]}</Text>
      </View>
      <ProgressRing
        segments={[
          { value: b.terminado, color: colors.success },
          { value: b.en_progreso, color: colors.info },
          { value: b.no_iniciado, color: colors.inkFaint },
        ]}
      />
      <RingLegend
        items={[
          { label: t('dashboard.done'), value: b.terminado, color: colors.success },
          { label: t('dashboard.inProgress'), value: b.en_progreso, color: colors.info },
          { label: t('dashboard.notStarted'), value: b.no_iniciado, color: colors.inkFaint },
        ]}
      />
    </View>
  );
}

function RoomRow({ room }: { room: Room }) {
  const s = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const t = useT().t;
  const roomStatus = useRoomStatusMeta();
  const meta = roomStatus[room.status];
  return (
    <AnimatedPressable onPress={() => router.push(`/room/${room.id}`)} style={s.row}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={s.rowTitle} numberOfLines={1}>{room.name}</Text>
        <Text style={s.rowSubtitle} numberOfLines={1}>
          {room.floor} · {room.guest_name ?? t('dashboard.free')}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {room.open_incidents > 0 && (
          <View style={s.badge}>
            <Ionicons name="warning" size={12} color={colors.danger} />
            <Text style={s.badgeText}>{room.open_incidents}</Text>
          </View>
        )}
        {room.open_tasks > 0 && (
          <View style={s.badge}>
            <Ionicons name="checkbox" size={12} color={colors.inkSoft} />
            <Text style={s.badgeText}>{room.open_tasks}</Text>
          </View>
        )}
        <Pill label={meta.label} color={meta.color} soft={meta.soft} />
      </View>
    </AnimatedPressable>
  );
}

function TaskRow({ task }: { task: Task }) {
  const s = useThemedStyles(makeStyles);
  const taskStatus = useTaskStatusMeta();
  const meta = taskStatus[task.status];
  return (
    <AnimatedPressable onPress={() => router.push(`/task/${task.id}`)} style={s.row}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={s.rowTitle} numberOfLines={1}>{task.title}</Text>
        <Text style={s.rowSubtitle} numberOfLines={1}>{task.room_name} · {task.room_floor}</Text>
      </View>
      <Pill label={meta.label} color={meta.color} />
    </AnimatedPressable>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const { t } = useT();
  const s = useThemedStyles(makeStyles);
  const isLead = isAtLeast(user, 'jefe');

  const [summary, setSummary] = useState<Summary | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [myTasks, setMyTasks] = useState<Task[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      if (isLead) {
        const [sum, roomList] = await Promise.all([
          api.get<Summary>('/api/summary'),
          api.get<Room[]>('/api/rooms'),
        ]);
        setSummary(sum);
        setRooms(roomList);
      } else {
        setMyTasks(await api.get<Task[]>('/api/tasks?mine=1'));
      }
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoaded(true);
    }
  }, [isLead]);

  useFocusEffect(
    useCallback(() => {
      load();
      const interval = setInterval(load, 15000);
      return () => clearInterval(interval);
    }, [load])
  );

  const myBuckets = useMemo(() => bucketFromTasks(myTasks), [myTasks]);
  const buckets = isLead ? summary?.tasksByType : myBuckets;

  if (!loaded) {
    return (
      <Screen>
        <ScrollView style={s.screen} contentContainerStyle={{ padding: 16, gap: 12 }}>
          <Skeleton variant="card" height={220} />
          <Skeleton variant="card" height={100} />
          <Skeleton variant="card" height={100} />
        </ScrollView>
      </Screen>
    );
  }

  if (error) {
    return (
      <Screen>
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <ErrorState text={t('common.connectionError')} retryLabel={t('common.retry')} onRetry={load} />
        </View>
      </Screen>
    );
  }

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
          />
        }
      >
        <Text style={s.subtitle}>{isLead ? t('dashboard.subtitleTeam') : t('dashboard.subtitleMine')}</Text>

        <Card style={{ flexDirection: 'row', paddingVertical: 20 }}>
          {RING_TYPES.map(({ type, icon }) => (
            <CategoryRing key={type} type={type} icon={icon} bucket={buckets?.[type]} />
          ))}
        </Card>

        {isLead ? (
          <>
            <Text style={s.sectionTitle}>{t('dashboard.roomsTitle')}</Text>
            {rooms.length === 0 ? (
              <Empty text={t('dashboard.emptyRooms')} />
            ) : (
              <View style={{ gap: 8 }}>
                {rooms.map((room) => <RoomRow key={room.id} room={room} />)}
              </View>
            )}
          </>
        ) : (
          <>
            <Text style={s.sectionTitle}>{t('dashboard.myTasksTitle')}</Text>
            {myTasks.length === 0 ? (
              <Empty text={t('dashboard.emptyTasks')} />
            ) : (
              <View style={{ gap: 8 }}>
                {myTasks.map((task) => <TaskRow key={task.id} task={task} />)}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

function makeStyles(colors: Colors) {
  return {
    screen: { flex: 1 } as ViewStyle,
    subtitle: { ...typeScale.caption, color: colors.inkSoft, marginBottom: 12 } as TextStyle,
    sectionTitle: { ...typeScale.label, color: colors.inkSoft, marginTop: 20, marginBottom: 8 } as TextStyle,
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.hairline,
      borderRadius: radius.md,
      paddingHorizontal: 14,
      paddingVertical: 12,
    } as ViewStyle,
    rowTitle: { ...typeScale.bodyStrong, color: colors.ink } as TextStyle,
    rowSubtitle: { ...typeScale.caption, color: colors.inkSoft } as TextStyle,
    badge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      backgroundColor: colors.surfaceSunken,
      borderRadius: radius.pill,
      paddingHorizontal: 6,
      paddingVertical: 3,
    } as ViewStyle,
    badgeText: { fontFamily: fonts.uiBold, fontSize: 11, color: colors.inkSoft } as TextStyle,
  };
}
