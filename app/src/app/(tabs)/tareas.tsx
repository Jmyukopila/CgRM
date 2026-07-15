import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, Text, TextStyle, View, ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';
import { AnimatedPressable, cardShadow, Empty, ErrorState, Pill, Screen, Skeleton } from '../../components/ui';
import { api, type Task } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { usePriorityMeta, useT, useTaskStatusMeta, useTaskTypeLabels } from '../../lib/i18n';
import { useFadeSlideIn, useStaggerDelay } from '../../lib/motion';
import { isAtLeast } from '../../lib/permissions';
import { typeScale, type Colors } from '../../lib/theme';
import { useThemedStyles, useTheme } from '../../lib/theme-context';

function TaskRow({
  task,
  index,
  st,
  pr,
  typeLabel,
}: {
  task: Task;
  index: number;
  st: { label: string; color: string };
  pr: { label: string; color: string };
  typeLabel: string;
}) {
  const { t } = useT();
  const s = useThemedStyles(makeStyles);
  const fade = useFadeSlideIn(useStaggerDelay(index));
  const progress =
    (task.total_items ?? 0) > 0 ? ` · ${task.done_items}/${task.total_items} ${t('tasks.breakdown')}` : '';
  return (
    <Animated.View style={fade}>
      <AnimatedPressable onPress={() => router.push(`/task/${task.id}`)} style={s.card}>
        <View style={s.cardHeader}>
          <Text style={s.room}>{task.room_name}</Text>
          <Pill label={st.label} color={st.color} />
        </View>
        <Text style={s.title}>
          {typeLabel}{task.incident_id ? ` ${t('tasks.incidentTag')}` : ''}{progress}
        </Text>
        {task.title !== `${typeLabel} · ${task.room_name}` && (
          <Text style={s.desc} numberOfLines={1}>{task.title}</Text>
        )}
        <View style={s.cardFooter}>
          <Text style={[s.priority, { color: pr.color }]}>● {pr.label}</Text>
          <Text style={s.assignee}>{task.assignee_name ?? t('common.unassigned')}</Text>
        </View>
      </AnimatedPressable>
    </Animated.View>
  );
}

export default function Tareas() {
  const { user } = useAuth();
  const { t } = useT();
  const { colors } = useTheme();
  const s = useThemedStyles(makeStyles);
  const priority = usePriorityMeta();
  const taskStatus = useTaskStatusMeta();
  const taskType = useTaskTypeLabels();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [showClosed, setShowClosed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // De líder para arriba se ve el tablón completo (del área, o de todas si es jefe);
  // el empleado ve lo suyo y lo que está sin coger en su área.
  const load = useCallback(async () => {
    try {
      const mine = isAtLeast(user, 'jefe') ? '' : 'mine=1&';
      const status = showClosed ? '' : 'status=abiertas';
      setTasks(await api.get<Task[]>(`/api/tasks?${mine}${status}`));
      setError(false);
    } catch {
      // reintento en el siguiente foco
      setError(true);
    } finally {
      setLoaded(true);
    }
  }, [user, showClosed]);

  useFocusEffect(
    useCallback(() => {
      load();
      const interval = setInterval(load, 15000);
      return () => clearInterval(interval);
    }, [load])
  );

  if (!loaded) {
    return (
      <Screen>
        <View style={{ padding: 16, gap: 10 }}>
          <Skeleton variant="card" height={92} />
          <Skeleton variant="card" height={92} />
          <Skeleton variant="card" height={92} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      {error ? (
        <View style={{ flex: 1, justifyContent: 'center', padding: 16 }}>
          <ErrorState text={t('common.connectionError')} retryLabel={t('common.retry')} onRetry={load} />
        </View>
      ) : (
        <FlatList
          style={s.screen}
          contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
          data={tasks}
          keyExtractor={(task) => String(task.id)}
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
          ListHeaderComponent={
            <Pressable onPress={() => setShowClosed((v) => !v)} style={s.toggle} hitSlop={8}>
              <Text style={s.toggleText}>{showClosed ? t('tasks.showAll') : t('tasks.showOpen')}</Text>
            </Pressable>
          }
          ListEmptyComponent={<Empty text={t('tasks.empty')} icon="sunny-outline" />}
          renderItem={({ item, index }) => (
            <TaskRow
              task={item}
              index={index}
              st={taskStatus[item.status]}
              pr={priority[item.priority]}
              typeLabel={taskType[item.type]}
            />
          )}
          ListFooterComponent={
            isAtLeast(user, 'jefe') ? (
              <Pressable onPress={() => router.push('/nueva-tarea-masiva' as any)} style={s.bulkButton}>
                <Text style={s.bulkButtonText}>{t('tasks.bulkNew')}</Text>
              </Pressable>
            ) : null
          }
        />
      )}
    </Screen>
  );
}

function makeStyles(colors: Colors) {
  return {
    screen: { flex: 1 } as ViewStyle,
    toggle: { minHeight: 44, justifyContent: 'center', marginBottom: 8 } as ViewStyle,
    toggleText: { fontSize: 12, color: colors.inkSoft, fontWeight: '600' } as TextStyle,
    card: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.hairline,
      borderRadius: 14,
      padding: 14,
      marginBottom: 10,
      gap: 4,
      ...cardShadow(colors),
    } as ViewStyle,
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' } as ViewStyle,
    room: { ...typeScale.heading, fontSize: 17, color: colors.ink } as TextStyle,
    title: { fontSize: 14, fontWeight: '600', color: colors.ink } as TextStyle,
    desc: { fontSize: 13, color: colors.inkSoft } as TextStyle,
    cardFooter: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: 4,
    } as ViewStyle,
    priority: { fontSize: 12, fontWeight: '700' } as TextStyle,
    assignee: { fontSize: 12, color: colors.inkSoft } as TextStyle,
    bulkButton: {
      borderWidth: 1,
      borderColor: colors.hairlineStrong,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
      marginTop: 8,
    } as ViewStyle,
    bulkButtonText: { fontSize: 14, fontWeight: '700', color: colors.accent } as TextStyle,
  };
}
