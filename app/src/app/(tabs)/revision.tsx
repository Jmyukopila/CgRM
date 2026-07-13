// Bandeja de revisión (líder / jefe): el trabajo entregado que espera veredicto.
// Es el contrapeso del sistema de evidencias — sin alguien que las mire, exigirlas no sirve.
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { cardShadow, Empty } from '../../components/ui';
import { api, type Task } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useAreaLabels, usePriorityMeta, useT, useTaskTypeLabels } from '../../lib/i18n';
import { seesAllAreas } from '../../lib/permissions';
import { colors } from '../../lib/theme';

// "hace 5 min" / "hace 2 h": lo que importa al revisar es cuánto lleva esperando.
function useWaiting() {
  const { lang } = useT();
  return (iso: string | null) => {
    if (!iso) return '';
    const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
    const prefix = lang === 'es' ? 'hace ' : '';
    const suffix = lang === 'es' ? '' : ' ago';
    if (mins < 60) return `${prefix}${mins} min${suffix}`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `${prefix}${hours} h${suffix}`;
    return `${prefix}${Math.round(hours / 24)} d${suffix}`;
  };
}

export default function Revision() {
  const { user } = useAuth();
  const { t } = useT();
  const priority = usePriorityMeta();
  const taskType = useTaskTypeLabels();
  const areas = useAreaLabels();
  const waiting = useWaiting();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setTasks(await api.get<Task[]>('/api/tasks?status=revision'));
    } catch {
      // reintento en el siguiente foco
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
      {tasks.length > 0 && (
        <Text style={styles.count}>{t('review.pending', { n: tasks.length })}</Text>
      )}
      {tasks.length === 0 && <Empty text={t('review.empty')} />}

      {tasks.map((task) => {
        const pr = priority[task.priority];
        // Nadie firma su propio trabajo: si es suyo, lo verá su jefe.
        const own = task.assignee_id === user?.id;
        return (
          <Pressable
            key={task.id}
            onPress={() => router.push(`/task/${task.id}`)}
            style={({ pressed }) => [styles.card, pressed && { opacity: 0.7 }]}
          >
            <View style={styles.cardHeader}>
              <Text style={styles.room}>{task.room_name}</Text>
              <View style={styles.evidenceBadge}>
                <Ionicons name="camera" size={13} color={colors.accent} />
                <Text style={styles.evidenceCount}>{task.evidence_count ?? 0}</Text>
              </View>
            </View>

            <Text style={styles.title}>
              {taskType[task.type]}
              {seesAllAreas(user) ? ` · ${areas[task.area]}` : ''}
            </Text>

            <View style={styles.cardFooter}>
              <Text style={[styles.priority, { color: pr.color }]}>● {pr.label}</Text>
              <Text style={styles.meta}>
                {task.assignee_name ?? t('common.unassigned')} · {waiting(task.done_at)}
              </Text>
            </View>

            {own && <Text style={styles.ownWork}>{t('review.ownWork')}</Text>}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  count: { fontSize: 12, color: colors.inkSoft, fontWeight: '700', marginBottom: 10 },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    gap: 4,
    ...cardShadow,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  room: { fontSize: 18, fontWeight: '800', color: colors.ink },
  evidenceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.accentSoft,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  evidenceCount: { fontSize: 12, fontWeight: '800', color: colors.accent },
  title: { fontSize: 14, fontWeight: '600', color: colors.ink },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  priority: { fontSize: 12, fontWeight: '700' },
  meta: { fontSize: 12, color: colors.inkSoft },
  ownWork: { fontSize: 12, color: colors.warning, fontWeight: '600', marginTop: 4 },
});
