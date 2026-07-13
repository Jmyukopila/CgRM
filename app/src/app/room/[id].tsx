import { router, useFocusEffect, useLocalSearchParams, useNavigation } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, cardShadow, Empty, Pill, SectionTitle, notify } from '../../components/ui';
import { api, type Incident, type Room, type Task, type User } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import {
  usePriorityMeta,
  useRoomStatusMeta,
  useRoomTypeLabels,
  useT,
  useTaskStatusMeta,
  useTaskTypeLabels,
} from '../../lib/i18n';
import { AREA_OF_TYPE, canSupervise, inArea, isAtLeast } from '../../lib/permissions';
import { colors } from '../../lib/theme';

// Tipos de trabajo que se pueden crear sobre una habitación, en orden de uso.
const TASK_TYPES = ['limpieza', 'inspeccion', 'mantenimiento', 'recepcion', 'cocina', 'lavanderia'];

function Selector<T extends string>({
  options,
  value,
  onChange,
  labels,
}: {
  options: T[];
  value: T;
  onChange: (v: T) => void;
  labels: Record<string, string>;
}) {
  return (
    <View style={styles.selector}>
      {options.map((opt) => (
        <Pressable
          key={opt}
          onPress={() => onChange(opt)}
          style={[styles.selectorChip, value === opt && styles.selectorChipActive]}
        >
          <Text style={[styles.selectorText, value === opt && { color: '#fff' }]}>
            {labels[opt] ?? opt}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

export default function RoomDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const navigation = useNavigation();
  const { t } = useT();
  const priority = usePriorityMeta();
  const roomStatus = useRoomStatusMeta();
  const roomType = useRoomTypeLabels();
  const taskStatus = useTaskStatusMeta();
  const taskType = useTaskTypeLabels();
  // Crear trabajo y forzar el estado de una habitación es potestad del mando.
  const isSupervisor = isAtLeast(user, 'lider');

  const [room, setRoom] = useState<Room | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [staff, setStaff] = useState<User[]>([]);

  // Cada quien solo puede crear trabajo del área que supervisa: el líder de limpieza
  // no reparte órdenes de mantenimiento.
  const creatableTypes = TASK_TYPES.filter((type) => canSupervise(user, AREA_OF_TYPE[type]));

  // Formulario de nueva tarea (líder / jefe)
  const [newType, setNewType] = useState<string>(creatableTypes[0] ?? 'limpieza');
  const [newPriority, setNewPriority] = useState('media');
  const [newAssignee, setNewAssignee] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      const [rooms, roomTasks, roomIncidents] = await Promise.all([
        api.get<Room[]>('/api/rooms'),
        api.get<Task[]>(`/api/tasks?room_id=${id}`),
        api.get<Incident[]>(`/api/incidents?room_id=${id}`),
      ]);
      setRoom(rooms.find((r) => String(r.id) === id) ?? null);
      setTasks(roomTasks);
      setIncidents(roomIncidents);
    } catch {
      // reintento en el siguiente foco
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  useEffect(() => {
    if (isSupervisor) api.get<User[]>('/api/users').then(setStaff).catch(() => {});
  }, [isSupervisor]);

  useEffect(() => {
    if (room) navigation.setOptions({ title: room.name });
  }, [room, navigation]);

  if (!room) return null;
  const meta = roomStatus[room.status];

  const createTask = async () => {
    setCreating(true);
    try {
      await api.post('/api/tasks', {
        room_id: room.id,
        type: newType,
        priority: newPriority,
        assignee_id: newAssignee,
      });
      setNewAssignee(null);
      await load();
    } catch (e: any) {
      notify(t('common.error'), e.message);
    } finally {
      setCreating(false);
    }
  };

  // Asignar a alguien de otra área daría una tarea que su destinatario no puede ni abrir.
  const assignableStaff = staff.filter((s) => inArea(s, AREA_OF_TYPE[newType]));

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <View style={styles.header}>
        <View>
          <Text style={styles.roomName}>{room.name}</Text>
          <Text style={styles.roomMeta}>
            {room.floor} · {roomType[room.type]}
          </Text>
        </View>
        <Pill label={meta.label} color={meta.color} soft={meta.soft} />
      </View>

      {isSupervisor && (
        <>
          <SectionTitle>{t('room.changeStatus')}</SectionTitle>
          <View style={styles.selector}>
            {Object.entries(roomStatus).map(([key, st]) => (
              <Pressable
                key={key}
                onPress={async () => {
                  try {
                    await api.patch(`/api/rooms/${room.id}`, { status: key });
                    await load();
                  } catch (e: any) {
                    notify(t('common.error'), e.message);
                  }
                }}
                style={[
                  styles.selectorChip,
                  room.status === key && { backgroundColor: st.color, borderColor: 'transparent' },
                ]}
              >
                <Text style={[styles.selectorText, room.status === key && { color: '#fff' }]}>
                  {st.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <SectionTitle>{t('room.newTask')}</SectionTitle>
          <View style={styles.form}>
            <Selector
              options={creatableTypes}
              value={newType}
              onChange={(v) => {
                setNewType(v);
                setNewAssignee(null);
              }}
              labels={taskType}
            />
            <Selector
              options={['baja', 'media', 'alta', 'urgente']}
              value={newPriority}
              onChange={setNewPriority}
              labels={Object.fromEntries(Object.entries(priority).map(([k, v]) => [k, v.label]))}
            />
            <View style={styles.selector}>
              <Pressable
                onPress={() => setNewAssignee(null)}
                style={[styles.selectorChip, newAssignee === null && styles.selectorChipActive]}
              >
                <Text style={[styles.selectorText, newAssignee === null && { color: '#fff' }]}>
                  {t('common.unassigned')}
                </Text>
              </Pressable>
              {assignableStaff.map((s) => (
                <Pressable
                  key={s.id}
                  onPress={() => setNewAssignee(s.id)}
                  style={[styles.selectorChip, newAssignee === s.id && styles.selectorChipActive]}
                >
                  <Text style={[styles.selectorText, newAssignee === s.id && { color: '#fff' }]}>
                    {s.name}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Button label={t('room.createTask')} onPress={createTask} loading={creating} />
          </View>
        </>
      )}

      <SectionTitle>{t('room.tasksTitle')}</SectionTitle>
      {tasks.length === 0 && <Empty text={t('room.emptyTasks')} />}
      {tasks.map((task) => {
        const st = taskStatus[task.status];
        return (
          <Pressable
            key={task.id}
            onPress={() => router.push(`/task/${task.id}`)}
            style={({ pressed }) => [styles.itemRow, pressed && { opacity: 0.7 }]}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.itemTitle}>{taskType[task.type]}</Text>
              <Text style={styles.itemMeta}>{task.assignee_name ?? t('common.unassigned')}</Text>
            </View>
            <Pill label={st.label} color={st.color} />
          </Pressable>
        );
      })}

      <SectionTitle>{t('room.incidentsTitle')}</SectionTitle>
      {incidents.length === 0 && <Empty text={t('room.emptyIncidents')} />}
      {incidents.map((inc) => (
        <Pressable
          key={inc.id}
          onPress={() => inc.task_id && router.push(`/task/${inc.task_id}`)}
          style={({ pressed }) => [styles.itemRow, pressed && { opacity: 0.7 }]}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.itemTitle}>{inc.title}</Text>
            <Text style={styles.itemMeta}>
              {priority[inc.priority].label} · {inc.reported_by_name}
            </Text>
          </View>
          <Pill
            label={inc.status === 'resuelta' ? t('room.resolved') : t('room.open')}
            color={inc.status === 'resuelta' ? colors.success : colors.danger}
            soft={inc.status === 'resuelta' ? colors.successSoft : colors.dangerSoft}
          />
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  roomName: { fontSize: 30, fontWeight: '900', color: colors.ink, letterSpacing: -0.5 },
  roomMeta: { fontSize: 14, color: colors.inkSoft },
  selector: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  selectorChip: {
    borderWidth: 1,
    borderColor: colors.hairlineStrong,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.surface,
  },
  selectorChipActive: { backgroundColor: colors.ink, borderColor: 'transparent' },
  selectorText: { fontSize: 13, fontWeight: '700', color: colors.ink },
  form: { gap: 10 },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
    ...cardShadow,
  },
  itemTitle: { fontSize: 15, fontWeight: '700', color: colors.ink },
  itemMeta: { fontSize: 12, color: colors.inkSoft },
});
