import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useNavigation } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { EvidenceStrip } from '../../components/evidence';
import { Button, cardShadow, Pill, SectionTitle, notify } from '../../components/ui';
import { api, type Evidence, type Message, type Task, type TaskItem } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { listEvidence } from '../../lib/evidence';
import { useAreaLabels, usePriorityMeta, useT, useTaskStatusMeta, useTaskTypeLabels } from '../../lib/i18n';
import { canReviewTask, canSupervise, canWorkTask } from '../../lib/permissions';
import { colors } from '../../lib/theme';

// mm:ss si dura menos de una hora, si no hh:mm:ss.
function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

function LiveTimer({ startedAt, label }: { startedAt: string; label: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);
  // Postgres entrega timestamptz ya en ISO 8601 con zona.
  const started = new Date(startedAt).getTime();
  return (
    <View style={styles.timerBox}>
      <Ionicons name="time-outline" size={18} color={colors.accent} />
      <Text style={styles.timerText}>
        {label} · {formatElapsed(now - started)}
      </Text>
    </View>
  );
}

function MessageThread({ taskId }: { taskId: number }) {
  const { t } = useT();
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(() => {
    api.get<Message[]>(`/api/messages?task_id=${taskId}`).then(setMessages).catch(() => {});
  }, [taskId]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, [load]);

  const send = async () => {
    if (!text.trim()) return;
    setSending(true);
    try {
      await api.post('/api/messages', { task_id: taskId, text: text.trim() });
      setText('');
      load();
    } catch (e: any) {
      notify(t('common.error'), e.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <SectionTitle>{t('task.messagesTitle')}</SectionTitle>
      {messages.length === 0 && <Text style={styles.noMessages}>{t('task.noMessages')}</Text>}
      {messages.map((m) => (
        <View key={m.id} style={styles.messageRow}>
          <Text style={styles.messageSender}>{m.sender_name}</Text>
          <Text style={styles.messageText}>{m.text}</Text>
        </View>
      ))}
      <View style={styles.messageInputRow}>
        <TextInput
          style={styles.messageInput}
          placeholder={t('task.messagePlaceholder')}
          placeholderTextColor={colors.inkSoft}
          value={text}
          onChangeText={setText}
          multiline
        />
        <Pressable onPress={send} disabled={sending || !text.trim()} style={styles.sendButton}>
          <Ionicons name="send" size={18} color="#fff" />
        </Pressable>
      </View>
    </>
  );
}

// Un punto del checklist. Si exige evidencia, la casilla está bloqueada hasta que
// las fotos/vídeos adjuntos alcanzan el mínimo: es la regla que impide firmar
// una habitación sin haberla tocado.
function ChecklistRow({
  item,
  taskId,
  evidence,
  interactive,
  onToggle,
  onEvidenceChange,
}: {
  item: TaskItem;
  taskId: number;
  evidence: Evidence[];
  interactive: boolean;
  onToggle: (done: boolean) => void;
  onEvidenceChange: () => void;
}) {
  const { t } = useT();
  const satisfied = !item.requires_evidence || evidence.length >= item.min_evidence;
  const blocked = interactive && !item.done && !satisfied;

  const requirementLabel = {
    foto: t('evidence.requiredPhoto'),
    video: t('evidence.requiredVideo'),
    cualquiera: t('evidence.requiredAny'),
  }[item.evidence_kind];

  return (
    <View style={[styles.checkCard, blocked && styles.checkCardBlocked]}>
      <Pressable
        disabled={!interactive || blocked}
        onPress={() => onToggle(!item.done)}
        style={({ pressed }) => [
          styles.checkRow,
          pressed && { opacity: 0.7 },
          !interactive && { opacity: item.done ? 1 : 0.6 },
        ]}
      >
        <Ionicons
          name={item.done ? 'checkbox' : blocked ? 'lock-closed' : 'square-outline'}
          size={26}
          color={item.done ? colors.success : blocked ? colors.accent : colors.inkSoft}
        />
        <View style={{ flex: 1 }}>
          <Text style={[styles.checkText, item.done ? styles.checkTextDone : null]}>{item.text}</Text>
          {item.requires_evidence && (
            <View style={styles.requirementRow}>
              <Ionicons
                name={satisfied ? 'checkmark-circle' : 'camera-outline'}
                size={13}
                color={satisfied ? colors.success : colors.accent}
              />
              <Text style={[styles.requirement, satisfied && { color: colors.success }]}>
                {requirementLabel} · {t('evidence.count', { n: evidence.length, min: item.min_evidence })}
              </Text>
            </View>
          )}
        </View>
      </Pressable>

      {item.requires_evidence && (
        <EvidenceStrip
          target={{ task_id: taskId, task_item_id: item.id }}
          evidence={evidence}
          editable={interactive}
          requiredKind={item.evidence_kind}
          onChange={onEvidenceChange}
        />
      )}
    </View>
  );
}

export default function TaskDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const navigation = useNavigation();
  const { t } = useT();
  const priority = usePriorityMeta();
  const taskStatus = useTaskStatusMeta();
  const taskType = useTaskTypeLabels();
  const areas = useAreaLabels();
  const [task, setTask] = useState<Task | null>(null);
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [fresh, files] = await Promise.all([
        api.get<Task>(`/api/tasks/${id}`),
        listEvidence({ task_id: Number(id) }),
      ]);
      setTask(fresh);
      setEvidence(files);
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
    if (task) navigation.setOptions({ title: `${taskType[task.type]} · ${task.room_name}` });
  }, [task, navigation, taskType]);

  if (!task || !user) return null;

  const st = taskStatus[task.status];
  const pr = priority[task.priority];
  const items = task.items ?? [];
  const doneCount = items.filter((i) => i.done).length;
  const canWork = canWorkTask(user, task);
  const canReview = canReviewTask(user, task);
  const canCancel = canSupervise(user, task.area);
  const interactive = canWork && task.status === 'en_curso';
  const taskEvidence = evidence.filter((e) => e.task_item_id === null);
  const evidenceOf = (itemId: number) => evidence.filter((e) => e.task_item_id === itemId);

  const changeStatus = async (status: string, reviewNote?: string) => {
    setBusy(true);
    try {
      setTask(await api.patch<Task>(`/api/tasks/${task.id}`, { status, review_note: reviewNote }));
      setNote('');
      await load();
    } catch (e: any) {
      notify(t('common.error'), e.message);
    } finally {
      setBusy(false);
    }
  };

  const reject = () => {
    if (!note.trim()) return notify(t('common.error'), t('review.needNote'));
    changeStatus('rechazada', note.trim());
  };

  const toggleItem = async (itemId: number, done: boolean) => {
    // Optimista: marca en local y sincroniza.
    setTask((prev) =>
      prev ? { ...prev, items: prev.items?.map((i) => (i.id === itemId ? { ...i, done } : i)) } : prev
    );
    try {
      setTask(await api.patch<Task>(`/api/task-items/${itemId}`, { done }));
    } catch (e: any) {
      notify(t('common.error'), e.message);
      await load();
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{task.title}</Text>
          <Text style={styles.meta}>
            {areas[task.area]} · {task.room_floor} · {task.assignee_name ?? t('common.unassigned')}
          </Text>
        </View>
        <Pill label={st.label} color={st.color} />
      </View>

      <Text style={[styles.priority, { color: pr.color }]}>● {pr.label}</Text>
      {task.description ? <Text style={styles.desc}>{task.description}</Text> : null}
      {task.incident_id ? <Text style={styles.incidentNote}>{t('task.fromIncident')}</Text> : null}

      {/* La devolución del supervisor va arriba del todo: es lo que hay que arreglar. */}
      {task.status === 'rechazada' && (
        <View style={styles.rejectBanner}>
          <Ionicons name="arrow-undo" size={18} color={colors.danger} />
          <View style={{ flex: 1 }}>
            <Text style={styles.rejectTitle}>
              {t('review.rejectedBy', { name: task.reviewed_by_name ?? '' })}
            </Text>
            <Text style={styles.rejectNote}>{task.review_note}</Text>
          </View>
        </View>
      )}
      {task.status === 'verificada' && task.reviewed_by_name && (
        <View style={styles.verifiedBanner}>
          <Ionicons name="shield-checkmark" size={18} color={colors.success} />
          <Text style={styles.verifiedText}>
            {t('review.verifiedBy', { name: task.reviewed_by_name })}
            {task.review_note ? ` · ${task.review_note}` : ''}
          </Text>
        </View>
      )}

      {task.status === 'en_curso' && task.started_at && (
        <LiveTimer startedAt={task.started_at} label={t('task.elapsed')} />
      )}

      {items.length > 0 && (
        <>
          <SectionTitle>{`${t('task.checklist')} · ${doneCount}/${items.length}`}</SectionTitle>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${(doneCount / items.length) * 100}%` }]} />
          </View>
          {items.map((item) => (
            <ChecklistRow
              key={item.id}
              item={item}
              taskId={task.id}
              evidence={evidenceOf(item.id)}
              interactive={interactive}
              onToggle={(done) => toggleItem(item.id, done)}
              onEvidenceChange={load}
            />
          ))}
        </>
      )}

      {/* Evidencia suelta de la tarea (una foto general del antes/después, por ejemplo). */}
      {(interactive || taskEvidence.length > 0) && (
        <>
          <SectionTitle>{t('evidence.title')}</SectionTitle>
          <EvidenceStrip
            target={{ task_id: task.id }}
            evidence={taskEvidence}
            editable={interactive}
            onChange={load}
          />
        </>
      )}

      <View style={{ gap: 10, marginTop: 24 }}>
        {['pendiente', 'rechazada'].includes(task.status) && canWork && (
          <Button label={t('task.startWork')} onPress={() => changeStatus('en_curso')} loading={busy} />
        )}
        {task.status === 'en_curso' && canWork && (
          <Button
            label={
              items.length > 0 && doneCount < items.length
                ? t('task.completeMissing', { n: items.length - doneCount })
                : t('task.markDone')
            }
            color={colors.success}
            disabled={items.length > 0 && doneCount < items.length}
            onPress={() => changeStatus('hecha')}
            loading={busy}
          />
        )}

        {/* Bandeja de revisión: verificar o devolver con motivo. */}
        {task.status === 'hecha' && canReview && (
          <>
            <Text style={styles.reviewHint}>{t('review.checkEvidence')}</Text>
            <TextInput
              style={styles.noteInput}
              placeholder={t('review.notePlaceholder')}
              placeholderTextColor={colors.inkFaint}
              value={note}
              onChangeText={setNote}
              multiline
            />
            <Button
              label={t('review.approve')}
              color={colors.success}
              onPress={() => changeStatus('verificada', note.trim())}
              loading={busy}
            />
            <Button label={t('review.reject')} kind="danger" onPress={reject} />
          </>
        )}
        {task.status === 'hecha' && !canReview && task.assignee_id === user.id && (
          <Text style={styles.readonly}>{t('review.ownWork')}</Text>
        )}

        {['pendiente', 'en_curso'].includes(task.status) && canCancel && (
          <Button label={t('task.cancelTask')} kind="ghost" onPress={() => changeStatus('cancelada')} />
        )}
        {!canWork && ['pendiente', 'en_curso'].includes(task.status) && (
          <Text style={styles.readonly}>{t('task.assignedTo', { name: task.assignee_name ?? '' })}</Text>
        )}
      </View>

      <MessageThread taskId={task.id} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  title: { fontSize: 22, fontWeight: '800', color: colors.ink, letterSpacing: -0.3 },
  meta: { fontSize: 13, color: colors.inkSoft, marginTop: 2 },
  priority: { fontSize: 13, fontWeight: '700', marginTop: 10 },
  desc: { fontSize: 14, color: colors.ink, marginTop: 8, lineHeight: 20 },
  incidentNote: {
    fontSize: 13,
    color: colors.accent,
    backgroundColor: colors.accentSoft,
    borderRadius: 10,
    padding: 10,
    marginTop: 10,
    fontWeight: '600',
  },
  rejectBanner: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    backgroundColor: colors.dangerSoft,
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
  },
  rejectTitle: { fontSize: 13, fontWeight: '800', color: colors.danger },
  rejectNote: { fontSize: 14, color: colors.ink, marginTop: 2, lineHeight: 20 },
  verifiedBanner: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    backgroundColor: colors.successSoft,
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
  },
  verifiedText: { fontSize: 13, fontWeight: '600', color: colors.success, flex: 1 },
  timerBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.accentSoft,
    borderRadius: 10,
    padding: 10,
    marginTop: 10,
    alignSelf: 'flex-start',
  },
  timerText: { fontSize: 13, fontWeight: '700', color: colors.accent, fontVariant: ['tabular-nums'] },
  progressTrack: {
    height: 6,
    backgroundColor: colors.hairline,
    borderRadius: 3,
    marginBottom: 12,
    overflow: 'hidden',
  },
  progressFill: { height: 6, backgroundColor: colors.success, borderRadius: 3 },
  checkCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 12,
    padding: 14,
    marginBottom: 6,
    ...cardShadow,
  },
  // Un punto bloqueado por falta de evidencia se marca con el acento, no en gris:
  // no está deshabilitado, está esperando algo concreto.
  checkCardBlocked: { borderColor: colors.accentSoft, backgroundColor: '#FFFCF9' },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 30 },
  checkText: { fontSize: 15, color: colors.ink, fontWeight: '500' },
  checkTextDone: { color: colors.inkSoft, textDecorationLine: 'line-through' },
  requirementRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  requirement: { fontSize: 12, fontWeight: '700', color: colors.accent },
  reviewHint: { fontSize: 13, color: colors.inkSoft, textAlign: 'center' },
  noteInput: {
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.ink,
    backgroundColor: colors.surface,
    minHeight: 64,
    textAlignVertical: 'top',
  },
  readonly: { fontSize: 13, color: colors.inkSoft, textAlign: 'center' },
  noMessages: { fontSize: 13, color: colors.inkSoft, marginBottom: 8 },
  messageRow: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 10,
    padding: 10,
    marginBottom: 6,
  },
  messageSender: { fontSize: 12, fontWeight: '700', color: colors.accent, marginBottom: 2 },
  messageText: { fontSize: 14, color: colors.ink },
  messageInputRow: { flexDirection: 'row', gap: 8, marginTop: 8, alignItems: 'flex-end' },
  messageInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.ink,
    backgroundColor: colors.surface,
    minHeight: 44,
    maxHeight: 100,
  },
  sendButton: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
