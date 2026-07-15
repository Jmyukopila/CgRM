import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams, useNavigation } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import Animated from 'react-native-reanimated';
import {
  AnimatedPressable,
  Button,
  cardShadow,
  confirmAction,
  Empty,
  ErrorState,
  Pill,
  Screen,
  SectionTitle,
  Skeleton,
  notify,
} from '../../components/ui';
import { Timeline } from '../../components/timeline';
import {
  api,
  type AuditEntry,
  type ChecklistDraft,
  type Incident,
  type Room,
  type RoomChecklist,
  type RoomStatus,
  type Task,
  type User,
} from '../../lib/api';
import { ChecklistEditor, emptyChecklistItem } from '../../components/checklist-editor';
import { useAuth } from '../../lib/auth';
import {
  useIncidentStatusMeta,
  usePriorityMeta,
  useRoomStatusMeta,
  useRoomTypeLabels,
  useT,
  useTaskStatusMeta,
  useTaskTypeLabels,
  type TKey,
} from '../../lib/i18n';
import { useFadeSlideIn, useStaggerDelay } from '../../lib/motion';
import {
  AREA_OF_TYPE,
  canManageStays,
  canSetRoomStatus,
  canSupervise,
  inArea,
  isAtLeast,
  ROOM_FLOW,
} from '../../lib/permissions';
import { typeScale, type Colors } from '../../lib/theme';
import { useThemedStyles, useTheme } from '../../lib/theme-context';
import { groupByFloor } from '../../lib/utils';

// Tipos de trabajo que se pueden crear sobre una habitación, en orden de uso.
const TASK_TYPES = ['limpieza', 'inspeccion', 'mantenimiento', 'recepcion', 'cocina', 'lavanderia'];
const FREQUENCIES = ['diaria', 'semanal', 'mensual'] as const;
type Frequency = (typeof FREQUENCIES)[number];
const RUN_HOURS = ['06:00', '08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00'];
type ScheduleMode = 'unica' | 'recurrente' | 'programada';
const WEEK_DAYS = [1, 2, 3, 4, 5, 6, 0] as const; // empieza en lunes, más natural para el equipo
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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
  const s = useThemedStyles(makeStyles);
  return (
    <View style={s.selector}>
      {options.map((opt) => (
        <Pressable
          key={opt}
          onPress={() => onChange(opt)}
          style={[s.selectorChip, value === opt && s.selectorChipActive]}
        >
          <Text style={[s.selectorText, value === opt && s.selectorTextActive]}>
            {labels[opt] ?? opt}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function TaskRow({ task, index, stLabel, stColor, typeLabel }: { task: Task; index: number; stLabel: string; stColor: string; typeLabel: string }) {
  const { t } = useT();
  const s = useThemedStyles(makeStyles);
  const fade = useFadeSlideIn(useStaggerDelay(index));
  return (
    <Animated.View style={fade}>
      <AnimatedPressable onPress={() => router.push(`/task/${task.id}`)} style={s.itemRow}>
        <View style={{ flex: 1 }}>
          <Text style={s.itemTitle}>{typeLabel}</Text>
          <Text style={s.itemMeta}>{task.assignee_name ?? t('common.unassigned')}</Text>
        </View>
        <Pill label={stLabel} color={stColor} />
      </AnimatedPressable>
    </Animated.View>
  );
}

function IncidentRow({
  inc,
  index,
  prLabel,
  stLabel,
  stColor,
  stSoft,
}: {
  inc: Incident;
  index: number;
  prLabel: string;
  stLabel: string;
  stColor: string;
  stSoft: string;
}) {
  const s = useThemedStyles(makeStyles);
  const fade = useFadeSlideIn(useStaggerDelay(index));
  return (
    <Animated.View style={fade}>
      <AnimatedPressable onPress={() => router.push(`/incident/${inc.id}` as any)} style={s.itemRow}>
        <View style={{ flex: 1 }}>
          <Text style={s.itemTitle}>{inc.title}</Text>
          <Text style={s.itemMeta}>
            {prLabel} · {inc.reported_by_name}
          </Text>
        </View>
        <Pill label={stLabel} color={stColor} soft={stSoft} />
      </AnimatedPressable>
    </Animated.View>
  );
}

export default function RoomDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const navigation = useNavigation();
  const { t } = useT();
  const { colors } = useTheme();
  const s = useThemedStyles(makeStyles);
  const priority = usePriorityMeta();
  const roomStatus = useRoomStatusMeta();
  const roomType = useRoomTypeLabels();
  const taskStatus = useTaskStatusMeta();
  const taskType = useTaskTypeLabels();
  const incidentStatus = useIncidentStatusMeta();
  // Crear trabajo es potestad del mando; el estado de la habitación ya no se fuerza
  // a mano (lo deriva el servidor del flujo de tareas, ver server/src/index.js).
  const isSupervisor = isAtLeast(user, 'jefe');

  const [room, setRoom] = useState<Room | null>(null);
  const [allRooms, setAllRooms] = useState<Room[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [staff, setStaff] = useState<User[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [history, setHistory] = useState<AuditEntry[]>([]);
  const [statusBusy, setStatusBusy] = useState(false);
  const [stayBusy, setStayBusy] = useState(false);
  const [weekDays, setWeekDays] = useState<Set<number>>(new Set());

  // Cada quien solo puede crear trabajo del área que supervisa: el líder de limpieza
  // no reparte órdenes de mantenimiento.
  const creatableTypes = TASK_TYPES.filter((type) => canSupervise(user, AREA_OF_TYPE[type]));

  // Formulario de nueva tarea (líder / jefe), dentro del menú emergente
  const [modalOpen, setModalOpen] = useState(false);
  const [newType, setNewType] = useState<string>(creatableTypes[0] ?? 'limpieza');
  const [newPriority, setNewPriority] = useState('media');
  const [newAssignee, setNewAssignee] = useState<number | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>('unica');
  const [freq, setFreq] = useState<Frequency>('diaria');
  const [hours, setHours] = useState<Set<string>>(new Set(['10:00']));
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [creating, setCreating] = useState(false);
  // Puntos de la tarea a crear: siempre la checklist de este sitio para el tipo elegido,
  // editable aquí mismo — editarla aquí reescribe la checklist individual de la habitación.
  const [taskItems, setTaskItems] = useState<ChecklistDraft[]>([]);

  // La checklist propia del sitio, por tipo de trabajo, y su editor.
  const [checklist, setChecklist] = useState<RoomChecklist>({});
  const [editType, setEditType] = useState<string | null>(null);
  const [editItems, setEditItems] = useState<ChecklistDraft[]>([]);
  const [savingChecklist, setSavingChecklist] = useState(false);

  // Copiar la checklist de un tipo de trabajo a otras habitaciones, incluso después de creada.
  const [copyType, setCopyType] = useState<string | null>(null);
  const [copyTargets, setCopyTargets] = useState<Set<number>>(new Set());
  const [copying, setCopying] = useState(false);

  const scheduleLabels: Record<ScheduleMode, string> = {
    unica: t('room.scheduleOnce'),
    recurrente: t('room.scheduleRecurrent'),
    programada: t('room.scheduleDate'),
  };
  const freqLabels: Record<Frequency, string> = {
    diaria: t('bulk.freq.diaria'),
    semanal: t('bulk.freq.semanal'),
    mensual: t('bulk.freq.mensual'),
  };

  const toggleHour = (h: string) => {
    setHours((prev) => {
      const next = new Set(prev);
      if (next.has(h)) {
        if (next.size > 1) next.delete(h); // siempre queda al menos una hora
      } else {
        next.add(h);
      }
      return next;
    });
  };

  const load = useCallback(async () => {
    try {
      const [rooms, roomTasks, roomIncidents, entries] = await Promise.all([
        api.get<Room[]>('/api/rooms'),
        api.get<Task[]>(`/api/tasks?room_id=${id}`),
        api.get<Incident[]>(`/api/incidents?room_id=${id}`),
        api.get<AuditEntry[]>(`/api/audit?entity=room&id=${id}`),
      ]);
      setRoom(rooms.find((r) => String(r.id) === id) ?? null);
      setAllRooms(rooms);
      setTasks(roomTasks);
      setIncidents(roomIncidents);
      setHistory(entries);
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, [id]);

  const loadChecklist = useCallback(async () => {
    try {
      setChecklist(await api.get<RoomChecklist>(`/api/rooms/${id}/checklist`));
    } catch {
      // No es crítico: la ficha funciona sin la checklist propia cargada.
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
      if (isSupervisor) loadChecklist();
    }, [load, loadChecklist, isSupervisor])
  );

  useEffect(() => {
    if (isSupervisor) api.get<User[]>('/api/users').then(setStaff).catch(() => {});
  }, [isSupervisor]);

  useEffect(() => {
    if (room) navigation.setOptions({ title: room.name });
  }, [room, navigation]);

  if (!room) {
    if (loadError) {
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
        <ScrollView style={s.screen} contentContainerStyle={{ padding: 16, gap: 10 }}>
          <Skeleton variant="text" width="60%" height={30} />
          <Skeleton variant="text" width="40%" />
          <Skeleton variant="card" height={120} />
          <Skeleton variant="card" height={120} />
        </ScrollView>
      </Screen>
    );
  }
  const meta = roomStatus[room.status];

  const createTask = async () => {
    const custom = taskItems.filter((i) => i.text.trim());

    const base = {
      room_id: room.id,
      type: newType,
      title: newTitle.trim(),
      description: newDescription.trim(),
      priority: newPriority,
      assignee_id: newAssignee,
      // La checklist editada aquí ES la checklist individual del sitio para este tipo:
      // se persiste siempre, no hay ya un modo "a medida" que la deje sin guardar.
      items: custom,
      save_checklist: true,
    };

    if (scheduleMode === 'programada' && !DATE_RE.test(dateFrom.trim())) {
      notify(t('common.error'), t('room.dateInvalid'));
      return;
    }
    if (scheduleMode === 'programada' && dateTo.trim() && !DATE_RE.test(dateTo.trim())) {
      notify(t('common.error'), t('room.dateInvalid'));
      return;
    }

    setCreating(true);
    try {
      if (scheduleMode === 'unica') {
        await api.post('/api/tasks', base);
      } else if (scheduleMode === 'recurrente') {
        await api.post('/api/task-schedules', {
          ...base,
          freq,
          run_hours: [...hours].map((h) => parseInt(h, 10)),
          ...(freq === 'semanal' ? { week_days: [...weekDays] } : {}),
        });
        notify(t('room.scheduleCreated'));
      } else {
        await api.post('/api/task-schedules', {
          ...base,
          freq: 'una_vez',
          date_from: dateFrom.trim(),
          date_to: dateTo.trim() || undefined,
        });
        notify(t('room.scheduleCreated'));
      }
      setModalOpen(false);
      setNewAssignee(null);
      setNewTitle('');
      setNewDescription('');
      setScheduleMode('unica');
      setDateFrom('');
      setDateTo('');
      setTaskItems([]);
      setWeekDays(new Set());
      await load();
    } catch (e: any) {
      notify(t('common.error'), e.message);
    } finally {
      setCreating(false);
    }
  };

  // La checklist del formulario parte siempre de la checklist actual del sitio para el
  // tipo elegido (algo real que retocar), o de un punto en blanco si el sitio no tiene.
  const seedTaskItems = (type: string) => {
    const seed = checklist[type as keyof RoomChecklist];
    setTaskItems(
      seed && seed.length > 0
        ? seed.map((i) => ({
            text: i.text,
            requires_evidence: i.requires_evidence,
            evidence_kind: i.evidence_kind,
            min_evidence: i.min_evidence,
          }))
        : [emptyChecklistItem()]
    );
  };

  const startEditChecklist = (taskType: string) => {
    const existing = checklist[taskType as keyof RoomChecklist] ?? [];
    setEditItems(
      existing.length > 0
        ? existing.map((i) => ({
            text: i.text,
            requires_evidence: i.requires_evidence,
            evidence_kind: i.evidence_kind,
            min_evidence: i.min_evidence,
          }))
        : [emptyChecklistItem()]
    );
    setEditType(taskType);
  };

  const saveChecklist = async () => {
    if (!editType) return;
    const clean = editItems.filter((i) => i.text.trim());
    setSavingChecklist(true);
    try {
      await api.put(`/api/rooms/${room.id}/checklist`, { task_type: editType, items: clean });
      await loadChecklist();
      setEditType(null);
      notify(t('room.checklistSaved'));
    } catch (e: any) {
      notify(t('common.error'), e.message);
    } finally {
      setSavingChecklist(false);
    }
  };

  const toggleCopyTarget = (targetId: number) => {
    setCopyTargets((prev) => {
      const next = new Set(prev);
      if (next.has(targetId)) next.delete(targetId);
      else next.add(targetId);
      return next;
    });
  };

  // Copia la checklist YA guardada de este tipo (no ediciones sin guardar) a otras
  // habitaciones: cada una conserva su propia checklist individual, esta solo la clona.
  const submitCopyChecklist = async () => {
    if (!copyType || copyTargets.size === 0) return;
    const items = checklist[copyType as keyof RoomChecklist] ?? [];
    setCopying(true);
    try {
      await Promise.all(
        [...copyTargets].map((targetId) =>
          api.put(`/api/rooms/${targetId}/checklist`, { task_type: copyType, items })
        )
      );
      notify(t('room.checklistCopied'));
      setCopyType(null);
      setCopyTargets(new Set());
    } catch (e: any) {
      notify(t('common.error'), e.message);
    } finally {
      setCopying(false);
    }
  };

  // Asignar a alguien de otra área daría una tarea que su destinatario no puede ni abrir.
  const assignableStaff = staff.filter((s) => inArea(s, AREA_OF_TYPE[newType]));

  const roomActions = ROOM_FLOW[room.status].filter((next) => canSetRoomStatus(user, room, next));

  const setStatus = async (next: RoomStatus) => {
    setStatusBusy(true);
    try {
      await api.patch(`/api/rooms/${room.id}`, { status: next });
      await load();
    } catch (e: any) {
      notify(t('common.error'), e.message);
    } finally {
      setStatusBusy(false);
    }
  };

  const doCheckout = async () => {
    const ok = await confirmAction(
      t('stay.checkoutConfirmTitle'),
      t('stay.checkoutConfirmBody'),
      t('roomAction.checkout'),
      t('common.cancel')
    );
    if (!ok) return;
    setStayBusy(true);
    try {
      await api.post(`/api/rooms/${room.id}/checkout`, {});
      notify(t('stay.checkoutDone'));
      await load();
    } catch (e: any) {
      notify(t('common.error'), e.message);
    } finally {
      setStayBusy(false);
    }
  };

  const toggleWeekDay = (d: number) => {
    setWeekDays((prev) => {
      const next = new Set(prev);
      if (next.has(d)) {
        if (next.size > 1) next.delete(d);
      } else {
        next.add(d);
      }
      return next;
    });
  };

  return (
    <Screen>
      <ScrollView style={s.screen} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <View style={s.header}>
          <View>
            <Text style={s.roomName}>{room.name}</Text>
            <Text style={s.roomMeta}>
              {room.floor} · {roomType[room.type]}
            </Text>
          </View>
          <Pill label={meta.label} color={meta.color} soft={meta.soft} />
        </View>

        {roomActions.length > 0 && (
          <View style={s.actionsRow}>
            {roomActions.map((next) => (
              <Pressable
                key={next}
                disabled={statusBusy}
                onPress={() => setStatus(next)}
                style={[s.actionChip, { opacity: statusBusy ? 0.6 : 1 }]}
              >
                <Text style={s.actionChipText}>{t('roomAction.to', { status: roomStatus[next].label })}</Text>
              </Pressable>
            ))}
          </View>
        )}

        {canManageStays(user) && room.stay_id && (
          <View style={s.stayCard}>
            <SectionTitle>{t('stay.title')}</SectionTitle>
            <Text style={s.itemTitle}>{room.guest_name || t('common.unassigned')}</Text>
            {!!room.expected_checkout && (
              <Text style={s.itemMeta}>
                {t('stay.expectedCheckout')}: {room.expected_checkout}
              </Text>
            )}
            <View style={{ marginTop: 8 }}>
              <Button label={t('roomAction.checkout')} kind="danger" onPress={doCheckout} loading={stayBusy} />
            </View>
          </View>
        )}

        {isSupervisor && (
          <>
            <SectionTitle>{t('room.newTask')}</SectionTitle>
            <Button
              label={t('room.createTask')}
              icon="add"
              onPress={() => {
                seedTaskItems(newType);
                setModalOpen(true);
              }}
            />

            <SectionTitle>{t('room.checklistTitle')}</SectionTitle>
            <Text style={s.checklistHint}>{t('room.checklistHint')}</Text>
            {creatableTypes.map((ct) => {
              const points = checklist[ct as keyof RoomChecklist] ?? [];
              const editing = editType === ct;
              return (
                <View key={ct} style={s.checklistBlock}>
                  <View style={s.checklistHeader}>
                    <Text style={s.checklistType}>{`${taskType[ct]} · ${points.length}`}</Text>
                    <View style={{ flexDirection: 'row', gap: 16 }}>
                      {!editing && points.length > 0 && (
                        <Pressable
                          onPress={() => {
                            setCopyType(ct);
                            setCopyTargets(new Set());
                          }}
                          hitSlop={8}
                        >
                          <Text style={s.checklistEdit}>{t('room.checklistCopy')}</Text>
                        </Pressable>
                      )}
                      <Pressable onPress={() => (editing ? setEditType(null) : startEditChecklist(ct))} hitSlop={8}>
                        <Text style={s.checklistEdit}>
                          {editing ? t('common.cancel') : t('room.checklistEdit')}
                        </Text>
                      </Pressable>
                    </View>
                  </View>

                  {!editing &&
                    (points.length === 0 ? (
                      <Text style={s.checklistEmpty}>{t('room.checklistEmpty')}</Text>
                    ) : (
                      points.map((p) => (
                        <View key={p.id} style={s.pointRow}>
                          <Ionicons
                            name={p.requires_evidence ? 'camera' : 'ellipse-outline'}
                            size={14}
                            color={p.requires_evidence ? colors.accent : colors.inkFaint}
                          />
                          <Text style={s.pointText}>{p.text}</Text>
                        </View>
                      ))
                    ))}

                  {editing && (
                    <View style={{ gap: 12, marginTop: 8 }}>
                      <ChecklistEditor items={editItems} onChange={setEditItems} />
                      <Button
                        label={t('common.save')}
                        icon="checkmark"
                        onPress={saveChecklist}
                        loading={savingChecklist}
                      />
                    </View>
                  )}
                </View>
              );
            })}
          </>
        )}

        <SectionTitle>{t('room.tasksTitle')}</SectionTitle>
        {tasks.length === 0 && <Empty text={t('room.emptyTasks')} />}
        {tasks.map((task, i) => (
          <TaskRow
            key={task.id}
            task={task}
            index={i}
            stLabel={taskStatus[task.status].label}
            stColor={taskStatus[task.status].color}
            typeLabel={taskType[task.type]}
          />
        ))}

        <SectionTitle>{t('room.incidentsTitle')}</SectionTitle>
        {incidents.length === 0 && <Empty text={t('room.emptyIncidents')} />}
        {incidents.map((inc, i) => (
          <IncidentRow
            key={inc.id}
            inc={inc}
            index={i}
            prLabel={priority[inc.priority].label}
            stLabel={incidentStatus[inc.status].label}
            stColor={incidentStatus[inc.status].color}
            stSoft={incidentStatus[inc.status].soft}
          />
        ))}

        <Timeline entries={history} />
      </ScrollView>

      <Modal
        visible={modalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setModalOpen(false)}
      >
        <KeyboardAvoidingView
          style={s.backdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Pressable style={{ flex: 1 }} onPress={() => setModalOpen(false)} />
          <View style={s.sheet}>
            <View style={s.sheetHandle} />
            <View style={s.sheetHeader}>
              <Text style={s.sheetTitle}>{t('room.newTask')}</Text>
              <Pressable onPress={() => setModalOpen(false)} hitSlop={8}>
                <Ionicons name="close" size={22} color={colors.inkSoft} />
              </Pressable>
            </View>

            <ScrollView
              style={{ flexGrow: 0 }}
              contentContainerStyle={{ paddingBottom: 8, gap: 10 }}
              keyboardShouldPersistTaps="handled"
            >
              <Selector
                options={creatableTypes}
                value={newType}
                onChange={(v) => {
                  setNewType(v);
                  setNewAssignee(null);
                  seedTaskItems(v);
                }}
                labels={taskType}
              />
              <Selector
                options={['baja', 'media', 'alta', 'urgente']}
                value={newPriority}
                onChange={setNewPriority}
                labels={Object.fromEntries(Object.entries(priority).map(([k, v]) => [k, v.label]))}
              />
              <View style={s.selector}>
                <Pressable
                  onPress={() => setNewAssignee(null)}
                  style={[s.selectorChip, newAssignee === null && s.selectorChipActive]}
                >
                  <Text style={[s.selectorText, newAssignee === null && s.selectorTextActive]}>
                    {t('common.unassigned')}
                  </Text>
                </Pressable>
                {assignableStaff.map((staffMember) => (
                  <Pressable
                    key={staffMember.id}
                    onPress={() => setNewAssignee(staffMember.id)}
                    style={[s.selectorChip, newAssignee === staffMember.id && s.selectorChipActive]}
                  >
                    <Text style={[s.selectorText, newAssignee === staffMember.id && s.selectorTextActive]}>
                      {staffMember.name}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <SectionTitle>{t('room.taskName')}</SectionTitle>
              <TextInput
                style={s.input}
                placeholder={t('room.taskNamePlaceholder')}
                placeholderTextColor={colors.inkFaint}
                value={newTitle}
                onChangeText={setNewTitle}
              />
              <TextInput
                style={[s.input, s.textArea]}
                placeholder={t('room.taskDescriptionPlaceholder')}
                placeholderTextColor={colors.inkFaint}
                value={newDescription}
                onChangeText={setNewDescription}
                multiline
              />

              <SectionTitle>{t('room.taskChecklist')}</SectionTitle>
              <ChecklistEditor items={taskItems} onChange={setTaskItems} />

              <SectionTitle>{t('room.schedule')}</SectionTitle>
              <View style={s.selector}>
                {(['unica', 'recurrente', 'programada'] as ScheduleMode[]).map((mode) => (
                  <Pressable
                    key={mode}
                    onPress={() => setScheduleMode(mode)}
                    style={[s.selectorChip, scheduleMode === mode && s.selectorChipActive]}
                  >
                    <Text style={[s.selectorText, scheduleMode === mode && s.selectorTextActive]}>
                      {scheduleLabels[mode]}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {scheduleMode === 'recurrente' && (
                <>
                  <SectionTitle>{t('bulk.frequency')}</SectionTitle>
                  <View style={s.selector}>
                    {FREQUENCIES.map((f) => (
                      <Pressable
                        key={f}
                        onPress={() => setFreq(f)}
                        style={[s.selectorChip, freq === f && s.selectorChipActive]}
                      >
                        <Text style={[s.selectorText, freq === f && s.selectorTextActive]}>{freqLabels[f]}</Text>
                      </Pressable>
                    ))}
                  </View>

                  {freq === 'semanal' && (
                    <View style={s.selector}>
                      {WEEK_DAYS.map((d) => (
                        <Pressable
                          key={d}
                          onPress={() => toggleWeekDay(d)}
                          style={[s.selectorChip, weekDays.has(d) && s.selectorChipActive]}
                        >
                          <Text style={[s.selectorText, weekDays.has(d) && s.selectorTextActive]}>
                            {t(`weekday.${d}` as TKey)}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  )}

                  <SectionTitle>{t('bulk.hours')}</SectionTitle>
                  <View style={s.selector}>
                    {RUN_HOURS.map((h) => (
                      <Pressable
                        key={h}
                        onPress={() => toggleHour(h)}
                        style={[s.selectorChip, hours.has(h) && s.selectorChipActive]}
                      >
                        <Text style={[s.selectorText, hours.has(h) && s.selectorTextActive]}>{h}</Text>
                      </Pressable>
                    ))}
                  </View>
                </>
              )}

              {scheduleMode === 'programada' && (
                <>
                  <SectionTitle>{t('room.scheduleFrom')}</SectionTitle>
                  <TextInput
                    style={s.input}
                    placeholder={t('room.datePlaceholder')}
                    placeholderTextColor={colors.inkFaint}
                    value={dateFrom}
                    onChangeText={setDateFrom}
                  />
                  <SectionTitle>{t('room.scheduleTo')}</SectionTitle>
                  <TextInput
                    style={s.input}
                    placeholder={t('room.datePlaceholder')}
                    placeholderTextColor={colors.inkFaint}
                    value={dateTo}
                    onChangeText={setDateTo}
                  />
                </>
              )}
            </ScrollView>

            <View style={s.sheetFooter}>
              <Button label={t('room.createTask')} onPress={createTask} loading={creating} />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={copyType !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setCopyType(null)}
      >
        <KeyboardAvoidingView style={s.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={{ flex: 1 }} onPress={() => setCopyType(null)} />
          <View style={s.sheet}>
            <View style={s.sheetHandle} />
            <View style={s.sheetHeader}>
              <Text style={s.sheetTitle}>{t('room.checklistCopyTitle')}</Text>
              <Pressable onPress={() => setCopyType(null)} hitSlop={8}>
                <Ionicons name="close" size={22} color={colors.inkSoft} />
              </Pressable>
            </View>
            <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ paddingBottom: 8, gap: 12 }}>
              {groupByFloor(allRooms.filter((r) => r.id !== room.id)).map(([floor, list]) => (
                <View key={floor}>
                  <Text style={s.checklistHint}>{floor}</Text>
                  <View style={s.selector}>
                    {list.map((r) => (
                      <Pressable
                        key={r.id}
                        onPress={() => toggleCopyTarget(r.id)}
                        style={[s.selectorChip, copyTargets.has(r.id) && s.selectorChipActive]}
                      >
                        <Text style={[s.selectorText, copyTargets.has(r.id) && s.selectorTextActive]}>
                          {r.name}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              ))}
            </ScrollView>
            <View style={s.sheetFooter}>
              <Button
                label={t('room.checklistCopySubmit', { n: copyTargets.size })}
                onPress={submitCopyChecklist}
                loading={copying}
                disabled={copyTargets.size === 0}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </Screen>
  );
}

function makeStyles(colors: Colors) {
  return {
    screen: { flex: 1 } as ViewStyle,
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' } as ViewStyle,
    roomName: { ...typeScale.display, fontSize: 32, lineHeight: 36, color: colors.ink } as TextStyle,
    roomMeta: { ...typeScale.body, color: colors.inkSoft } as TextStyle,
    actionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 } as ViewStyle,
    actionChip: {
      minHeight: 44,
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.hairlineStrong,
      borderRadius: 999,
      paddingHorizontal: 14,
      backgroundColor: colors.surface,
    } as ViewStyle,
    actionChipText: { fontSize: 13, fontWeight: '700', color: colors.ink } as TextStyle,
    stayCard: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.hairline,
      borderRadius: 14,
      padding: 14,
      marginTop: 12,
      ...cardShadow(colors),
    } as ViewStyle,
    selector: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 } as ViewStyle,
    selectorChip: {
      borderWidth: 1,
      borderColor: colors.hairlineStrong,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 8,
      backgroundColor: colors.surface,
    } as ViewStyle,
    selectorChipActive: { backgroundColor: colors.ink, borderColor: 'transparent' } as ViewStyle,
    selectorText: { fontSize: 13, fontWeight: '700', color: colors.ink } as TextStyle,
    // Sobre fondo `ink` el texto legible en ambos temas es `bg`, no blanco fijo
    // (en oscuro `ink` es un tono claro: blanco fijo quedaría invisible).
    selectorTextActive: { color: colors.bg } as TextStyle,
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
      ...cardShadow(colors),
    } as ViewStyle,
    itemTitle: { fontSize: 15, fontWeight: '700', color: colors.ink } as TextStyle,
    itemMeta: { fontSize: 12, color: colors.inkSoft } as TextStyle,
    checklistHint: { fontSize: 12, color: colors.inkSoft, lineHeight: 17, marginBottom: 4 } as TextStyle,
    checklistBlock: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.hairline,
      borderRadius: 14,
      padding: 12,
      marginBottom: 8,
      ...cardShadow(colors),
    } as ViewStyle,
    checklistHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    } as ViewStyle,
    checklistType: { fontSize: 14, fontWeight: '800', color: colors.ink } as TextStyle,
    checklistEdit: { fontSize: 13, fontWeight: '700', color: colors.accent } as TextStyle,
    checklistEmpty: { fontSize: 13, color: colors.inkFaint, marginTop: 6 } as TextStyle,
    pointRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 } as ViewStyle,
    pointText: { flex: 1, fontSize: 14, color: colors.inkSoft } as TextStyle,
    input: {
      borderWidth: 1,
      borderColor: colors.hairline,
      borderRadius: 10,
      minHeight: 48,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 16,
      color: colors.ink,
    } as TextStyle,
    textArea: { minHeight: 80, textAlignVertical: 'top' } as TextStyle,
    backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' } as ViewStyle,
    sheet: {
      backgroundColor: colors.bg,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 24,
      maxHeight: '88%',
    } as ViewStyle,
    sheetHandle: {
      alignSelf: 'center',
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.hairlineStrong,
      marginBottom: 8,
    } as ViewStyle,
    sheetHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 4,
    } as ViewStyle,
    sheetTitle: { fontSize: 18, fontWeight: '800', color: colors.ink, letterSpacing: -0.3 } as TextStyle,
    sheetFooter: { marginTop: 12 } as ViewStyle,
  };
}
