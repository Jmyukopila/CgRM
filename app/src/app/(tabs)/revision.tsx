// Bandeja de revisión (líder / jefe): el trabajo entregado que espera veredicto.
// Es el contrapeso del sistema de evidencias — sin alguien que las mire, exigirlas no sirve.
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, Text, TextStyle, View, ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';
import { AnimatedPressable, cardShadow, Empty, ErrorState, Screen, Skeleton } from '../../components/ui';
import { api, type Task } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useAreaLabels, usePriorityMeta, useT, useTaskTypeLabels } from '../../lib/i18n';
import { useFadeSlideIn, useStaggerDelay } from '../../lib/motion';
import { seesAllAreas } from '../../lib/permissions';
import { typeScale, type Colors } from '../../lib/theme';
import { useThemedStyles, useTheme } from '../../lib/theme-context';

// "hace 5 min" / "hace 2 h": lo que importa al revisar es cuánto lleva esperando.
function useWaiting() {
  const { t } = useT();
  return (iso: string | null) => {
    if (!iso) return '';
    const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
    if (mins < 60) return t('time.minutesAgo', { n: mins });
    const hours = Math.round(mins / 60);
    if (hours < 24) return t('time.hoursAgo', { n: hours });
    return t('time.daysAgo', { n: Math.round(hours / 24) });
  };
}

function ReviewRow({
  task,
  index,
  own,
  prLabel,
  prColor,
  areaLabel,
  typeLabel,
  waitingLabel,
}: {
  task: Task;
  index: number;
  own: boolean;
  prLabel: string;
  prColor: string;
  areaLabel: string | null;
  typeLabel: string;
  waitingLabel: string;
}) {
  const { t } = useT();
  const { colors } = useTheme();
  const s = useThemedStyles(makeStyles);
  const fade = useFadeSlideIn(useStaggerDelay(index));
  return (
    <Animated.View style={fade}>
      <AnimatedPressable onPress={() => router.push(`/task/${task.id}`)} style={s.card}>
        <View style={s.cardHeader}>
          <Text style={s.room}>{task.room_name}</Text>
          <View style={s.evidenceBadge}>
            <Ionicons name="camera" size={13} color={colors.accent} />
            <Text style={s.evidenceCount}>{task.evidence_count ?? 0}</Text>
          </View>
        </View>

        <Text style={s.title}>
          {typeLabel}
          {areaLabel ? ` · ${areaLabel}` : ''}
        </Text>

        <View style={s.cardFooter}>
          <Text style={[s.priority, { color: prColor }]}>● {prLabel}</Text>
          <Text style={s.meta}>
            {task.assignee_name ?? t('common.unassigned')} · {waitingLabel}
          </Text>
        </View>

        {own && <Text style={s.ownWork}>{t('review.ownWork')}</Text>}
      </AnimatedPressable>
    </Animated.View>
  );
}

export default function Revision() {
  const { user } = useAuth();
  const { t } = useT();
  const { colors } = useTheme();
  const s = useThemedStyles(makeStyles);
  const priority = usePriorityMeta();
  const taskType = useTaskTypeLabels();
  const areas = useAreaLabels();
  const waiting = useWaiting();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setTasks(await api.get<Task[]>('/api/tasks?status=revision'));
      setError(false);
    } catch {
      // reintento en el siguiente foco
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
        {tasks.length > 0 && (
          <Text style={s.count}>{t('review.pending', { n: tasks.length })}</Text>
        )}

        {!loaded && (
          <View style={{ gap: 10 }}>
            <Skeleton variant="card" height={92} />
            <Skeleton variant="card" height={92} />
          </View>
        )}

        {loaded && error && <ErrorState text={t('common.connectionError')} retryLabel={t('common.retry')} onRetry={load} />}
        {loaded && !error && tasks.length === 0 && <Empty text={t('review.empty')} icon="sparkles-outline" />}

        {tasks.map((task, i) => (
          <ReviewRow
            key={task.id}
            task={task}
            index={i}
            own={task.assignee_id === user?.id}
            prLabel={priority[task.priority].label}
            prColor={priority[task.priority].color}
            areaLabel={seesAllAreas(user) ? areas[task.area] : null}
            typeLabel={taskType[task.type]}
            waitingLabel={waiting(task.done_at)}
          />
        ))}
      </ScrollView>
    </Screen>
  );
}

function makeStyles(colors: Colors) {
  return {
    screen: { flex: 1 } as ViewStyle,
    count: { fontSize: 12, color: colors.inkSoft, fontWeight: '700', marginBottom: 10 } as TextStyle,
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
    evidenceBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: colors.accentSoft,
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 3,
    } as ViewStyle,
    evidenceCount: { fontSize: 12, fontWeight: '800', color: colors.accent } as TextStyle,
    title: { fontSize: 14, fontWeight: '600', color: colors.ink } as TextStyle,
    cardFooter: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: 4,
    } as ViewStyle,
    priority: { fontSize: 12, fontWeight: '700' } as TextStyle,
    meta: { fontSize: 12, color: colors.inkSoft } as TextStyle,
    ownWork: { fontSize: 12, color: colors.warning, fontWeight: '600', marginTop: 4 } as TextStyle,
  };
}
