import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { cardShadow, Empty, Pill } from '../../components/ui';
import { api, type Task } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { usePriorityMeta, useT, useTaskStatusMeta, useTaskTypeLabels } from '../../lib/i18n';
import { isAtLeast } from '../../lib/permissions';
import { colors } from '../../lib/theme';

export default function Tareas() {
  const { user } = useAuth();
  const { t } = useT();
  const priority = usePriorityMeta();
  const taskStatus = useTaskStatusMeta();
  const taskType = useTaskTypeLabels();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [showClosed, setShowClosed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // De líder para arriba se ve el tablón completo (del área, o de todas si es jefe);
  // el empleado ve lo suyo y lo que está sin coger en su área.
  const load = useCallback(async () => {
    try {
      const mine = isAtLeast(user, 'lider') ? '' : 'mine=1&';
      const status = showClosed ? '' : 'status=abiertas';
      setTasks(await api.get<Task[]>(`/api/tasks?${mine}${status}`));
    } catch {
      // reintento en el siguiente foco
    }
  }, [user, showClosed]);

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
      <Pressable onPress={() => setShowClosed((v) => !v)} style={styles.toggle}>
        <Text style={styles.toggleText}>
          {showClosed ? t('tasks.showAll') : t('tasks.showOpen')}
        </Text>
      </Pressable>

      {tasks.length === 0 && <Empty text={t('tasks.empty')} />}

      {tasks.map((task) => {
        const st = taskStatus[task.status];
        const pr = priority[task.priority];
        const progress =
          (task.total_items ?? 0) > 0 ? ` · ${task.done_items}/${task.total_items} ${t('tasks.breakdown')}` : '';
        return (
          <Pressable
            key={task.id}
            onPress={() => router.push(`/task/${task.id}`)}
            style={({ pressed }) => [styles.card, pressed && { opacity: 0.7 }]}
          >
            <View style={styles.cardHeader}>
              <Text style={styles.room}>{task.room_name}</Text>
              <Pill label={st.label} color={st.color} />
            </View>
            <Text style={styles.title}>
              {taskType[task.type]}{task.incident_id ? ` ${t('tasks.incidentTag')}` : ''}{progress}
            </Text>
            {task.title !== `${taskType[task.type]} · ${task.room_name}` && (
              <Text style={styles.desc} numberOfLines={1}>{task.title}</Text>
            )}
            <View style={styles.cardFooter}>
              <Text style={[styles.priority, { color: pr.color }]}>● {pr.label}</Text>
              <Text style={styles.assignee}>{task.assignee_name ?? t('common.unassigned')}</Text>
            </View>
          </Pressable>
        );
      })}

      {isAtLeast(user, 'lider') && (
        <Pressable onPress={() => router.push('/nueva-tarea-masiva' as any)} style={styles.bulkButton}>
          <Text style={styles.bulkButtonText}>{t('tasks.bulkNew')}</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  toggle: { paddingVertical: 6, marginBottom: 8 },
  toggleText: { fontSize: 12, color: colors.inkSoft, fontWeight: '600' },
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
  title: { fontSize: 14, fontWeight: '600', color: colors.ink },
  desc: { fontSize: 13, color: colors.inkSoft },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  priority: { fontSize: 12, fontWeight: '700' },
  assignee: { fontSize: 12, color: colors.inkSoft },
  bulkButton: {
    borderWidth: 1,
    borderColor: colors.hairlineStrong,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  bulkButtonText: { fontSize: 14, fontWeight: '700', color: colors.accent },
});
