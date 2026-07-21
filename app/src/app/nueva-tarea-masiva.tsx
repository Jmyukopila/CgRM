// Asignación masiva: una misma orden de trabajo repartida por varios sitios a la vez.
// "Limpieza general" en las 8 habitaciones; "Repasar cloro" solo en la piscina; "Cierre"
// en la cocina. Cada sitio recibe SU tarea, con su checklist, y se puede seguir por
// separado.
import { router, useNavigation } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { ChecklistEditor, emptyChecklistItem } from '../components/checklist-editor';
import {
  Button,
  Chip,
  ErrorState,
  IconPickerField,
  SectionTitle,
  Screen,
  SegmentedControl,
  notify,
} from '../components/ui';
import { api, type ChecklistDraft, type Room, type User } from '../lib/api';
import { useAuth } from '../lib/auth';
import { usePriorityMeta, useT, useTaskTypeMeta, type TKey } from '../lib/i18n';
import { AREA_OF_TYPE, canSupervise, inArea } from '../lib/permissions';
import { typeScale, type Colors } from '../lib/theme';
import { useThemedStyles, useTheme } from '../lib/theme-context';
import { groupByFloor } from '../lib/utils';

const TASK_TYPES = ['limpieza', 'inspeccion', 'mantenimiento', 'recepcion', 'cocina', 'lavanderia'];
const FREQUENCIES = ['diaria', 'semanal', 'mensual'] as const;
type Frequency = (typeof FREQUENCIES)[number];
const RUN_HOURS = ['06:00', '08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00'];
const WEEK_DAYS = [1, 2, 3, 4, 5, 6, 0] as const;

export default function NuevaTareaMasiva() {
  const navigation = useNavigation();
  const { t } = useT();
  const { user } = useAuth();
  const { colors } = useTheme();
  const s = useThemedStyles(makeStyles);
  const priority = usePriorityMeta();
  const taskType = useTaskTypeMeta();

  const [rooms, setRooms] = useState<Room[]>([]);
  const [staff, setStaff] = useState<User[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  // Solo el trabajo de las áreas que uno supervisa.
  const creatableTypes = TASK_TYPES.filter((k) => canSupervise(user, AREA_OF_TYPE[k]));
  const [type, setType] = useState<string>(creatableTypes[0] ?? 'limpieza');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [prio, setPrio] = useState('media');
  const [assignee, setAssignee] = useState<number | 'auto' | null>(null);

  const [items, setItems] = useState<ChecklistDraft[]>([emptyChecklistItem()]);

  const [recurrent, setRecurrent] = useState(false);
  const [freq, setFreq] = useState<Frequency>('diaria');
  const [hours, setHours] = useState<Set<string>>(new Set(['10:00']));
  const [weekDays, setWeekDays] = useState<Set<number>>(new Set());
  const [creating, setCreating] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const freqLabels: Record<Frequency, string> = {
    diaria: t('bulk.freq.diaria'),
    semanal: t('bulk.freq.semanal'),
    mensual: t('bulk.freq.mensual'),
  };

  useEffect(() => {
    navigation.setOptions({ title: t('bulk.title') });
  }, [navigation, t]);

  const loadCatalog = () => {
    Promise.all([api.get<Room[]>('/api/rooms'), api.get<User[]>('/api/users')])
      .then(([r, u]) => {
        setRooms(r);
        setStaff(u);
        setLoadError(false);
      })
      .catch(() => setLoadError(true));
  };

  useEffect(loadCatalog, []);

  const byFloor = useMemo(() => groupByFloor(rooms), [rooms]);
  const zones = useMemo(() => rooms.filter((r) => r.type === 'zona_comun'), [rooms]);
  const bedrooms = useMemo(() => rooms.filter((r) => r.type !== 'zona_comun'), [rooms]);

  // Asignar a alguien de otra área daría una tarea que su destinatario no puede ni abrir.
  const assignableStaff = staff.filter((m) => inArea(m, AREA_OF_TYPE[type]));

  // Solo se resiembra la checklist si sigue en blanco (nada escrito todavía): así una
  // segunda selección no pisa lo que el mando ya lleva editado a mano.
  const blank = items.every((i) => !i.text.trim());

  const setAll = (list: Room[], on: boolean) => {
    const next = new Set(selected);
    for (const r of list) (on ? next.add(r.id) : next.delete(r.id));
    setSelected(next);
    if (blank) seedItemsFor(type, next);
  };

  const toggle = (id: number) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
    if (blank) seedItemsFor(type, next);
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

  // La checklist siempre empieza en blanco: quien crea la tarea decide qué puntos
  // lleva, sin heredar nada de la checklist ya guardada del sitio.
  const seedItemsFor = async (_forType: string, _roomIds: Set<number>) => {
    setItems([emptyChecklistItem()]);
  };

  const submit = async () => {
    if (selected.size === 0) {
      notify(t('bulk.missingTitle'), t('bulk.missingBody'));
      return;
    }
    if (!title.trim()) {
      notify(t('bulk.missingTitle'), t('bulk.missingName'));
      return;
    }

    const custom = items.filter((i) => i.text.trim());

    const base = {
      room_ids: [...selected],
      type,
      title: title.trim(),
      description: description.trim(),
      priority: prio,
      assignee_id: assignee,
      // La checklist editada aquí ES la checklist individual de cada sitio elegido para
      // este tipo: se persiste siempre, no hay ya un modo "a medida" que la deje sin guardar.
      items: custom,
      save_checklist: true,
    };

    setCreating(true);
    try {
      if (recurrent) {
        await api.post('/api/task-schedules', {
          ...base,
          freq,
          run_hours: [...hours].map((h) => parseInt(h, 10)),
          ...(freq === 'semanal' ? { week_days: [...weekDays] } : {}),
        });
      } else {
        await api.post('/api/tasks', base);
      }
      if (router.canGoBack()) router.back();
      else router.replace('/(tabs)/tareas');
    } catch (e: any) {
      notify(t('common.error'), e.message);
    } finally {
      setCreating(false);
    }
  };

  if (loadError) {
    return (
      <Screen>
        <View style={{ flex: 1, justifyContent: 'center', padding: 16 }}>
          <ErrorState text={t('common.connectionError')} retryLabel={t('common.retry')} onRetry={loadCatalog} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={s.screen}
        contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
        keyboardShouldPersistTaps="handled"
      >
        <SectionTitle>{t('bulk.what')}</SectionTitle>
        <TextInput
          style={s.input}
          placeholder={t('bulk.titlePlaceholder')}
          placeholderTextColor={colors.inkFaint}
          value={title}
          onChangeText={setTitle}
        />
        <TextInput
          style={[s.input, s.textArea]}
          placeholder={t('bulk.descPlaceholder')}
          placeholderTextColor={colors.inkFaint}
          value={description}
          onChangeText={setDescription}
          multiline
        />
        <View style={{ marginTop: 12 }}>
          <IconPickerField
            subtitle={t('bulk.type')}
            value={type}
            options={creatableTypes.map((k) => ({ value: k, ...taskType[k] }))}
            onChange={(k) => {
              setType(k);
              setAssignee(null);
              // La checklist era la del tipo anterior: se resiembra para el nuevo.
              seedItemsFor(k, selected);
            }}
          />
        </View>
        <View style={{ marginTop: 16 }}>
          <Text style={s.subtitle}>{t('bulk.priority')}</Text>
          <SegmentedControl
            options={Object.entries(priority).map(([key, p]) => ({
              value: key,
              label: p.label,
              icon: p.icon,
              color: p.color,
            }))}
            value={prio}
            onChange={setPrio}
          />
        </View>

        <SectionTitle>{`${t('bulk.where')} · ${t('bulk.selectedCount', { n: selected.size })}`}</SectionTitle>
        <View style={s.chips}>
          <Chip label={t('bulk.allRooms')} active={false} onPress={() => setAll(bedrooms, true)} />
          <Chip label={t('bulk.allZones')} active={false} onPress={() => setAll(zones, true)} />
          <Chip label={t('bulk.clear')} active={false} onPress={() => setSelected(new Set())} />
        </View>

        {byFloor.map(([floor, list]) => {
          const allSelected = list.every((r) => selected.has(r.id));
          return (
            <View key={floor} style={{ marginTop: 12 }}>
              <Pressable onPress={() => setAll(list, !allSelected)} style={s.floorHeader}>
                <Text style={s.floorTitle}>{floor}</Text>
                <Text style={s.floorAction}>
                  {allSelected ? t('bulk.deselectAll') : t('bulk.selectAll')}
                </Text>
              </Pressable>
              <View style={s.chips}>
                {list.map((r) => (
                  <Chip
                    key={r.id}
                    label={r.name}
                    active={selected.has(r.id)}
                    onPress={() => toggle(r.id)}
                  />
                ))}
              </View>
            </View>
          );
        })}

        <SectionTitle>{t('bulk.who')}</SectionTitle>
        <View style={s.chips}>
          <Chip
            label={t('common.unassigned')}
            active={assignee === null}
            onPress={() => setAssignee(null)}
          />
          {assignableStaff.length > 0 && (
            <Chip
              label={t('bulk.autoAssign')}
              active={assignee === 'auto'}
              onPress={() => setAssignee('auto')}
            />
          )}
          {assignableStaff.map((m) => (
            <Chip
              key={m.id}
              label={m.name}
              active={assignee === m.id}
              onPress={() => setAssignee(m.id)}
            />
          ))}
        </View>

        <SectionTitle>{t('bulk.checklist')}</SectionTitle>
        <Text style={s.hint}>{t('bulk.checklistHint')}</Text>
        <View style={{ marginTop: 12 }}>
          <ChecklistEditor items={items} onChange={setItems} />
        </View>

        <View style={s.switchRow}>
          <Text style={s.switchLabel}>{t('bulk.recurrent')}</Text>
          <Switch
            value={recurrent}
            onValueChange={setRecurrent}
            trackColor={{ false: colors.hairlineStrong, true: colors.accent }}
            thumbColor="#fff"
          />
        </View>

        {recurrent && (
          <>
            <SectionTitle>{t('bulk.frequency')}</SectionTitle>
            <View style={s.chips}>
              {FREQUENCIES.map((f) => (
                <Chip key={f} label={freqLabels[f]} active={freq === f} onPress={() => setFreq(f)} />
              ))}
            </View>

            {freq === 'semanal' && (
              <View style={s.chips}>
                {WEEK_DAYS.map((d) => (
                  <Chip
                    key={d}
                    label={t(`weekday.${d}` as TKey)}
                    active={weekDays.has(d)}
                    onPress={() => toggleWeekDay(d)}
                  />
                ))}
              </View>
            )}

            <SectionTitle>{t('bulk.hours')}</SectionTitle>
            <View style={s.chips}>
              {RUN_HOURS.map((h) => (
                <Chip key={h} label={h} active={hours.has(h)} onPress={() => toggleHour(h)} />
              ))}
            </View>
          </>
        )}
      </ScrollView>

      {/* Fuera del scroll: el botón que crea el trabajo no se pierde de vista por larga
          que sea la lista de sitios. */}
      <View style={s.footer}>
        <Button
          label={t('bulk.submit', { n: selected.size })}
          icon="checkmark"
          onPress={submit}
          loading={creating}
          disabled={selected.size === 0}
        />
      </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function makeStyles(colors: Colors) {
  return {
    screen: { flex: 1 } as ViewStyle,
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 } as ViewStyle,
    input: {
      borderWidth: 1,
      borderColor: colors.hairline,
      borderRadius: 10,
      minHeight: 48,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 16,
      color: colors.ink,
      backgroundColor: colors.surface,
      marginBottom: 8,
    } as TextStyle,
    textArea: { minHeight: 72, textAlignVertical: 'top' } as TextStyle,
    hint: { fontSize: 12, color: colors.inkSoft, marginTop: 6, lineHeight: 17 } as TextStyle,
    subtitle: { ...typeScale.label, color: colors.inkSoft, marginBottom: 6 } as TextStyle,
    floorHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 6,
    } as ViewStyle,
    floorTitle: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.inkSoft,
      textTransform: 'uppercase',
      letterSpacing: 1,
    } as TextStyle,
    floorAction: { fontSize: 12, fontWeight: '700', color: colors.accent } as TextStyle,
    switchRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: 20,
      paddingVertical: 4,
    } as ViewStyle,
    switchLabel: { fontSize: 15, fontWeight: '700', color: colors.ink } as TextStyle,
    footer: {
      padding: 16,
      borderTopWidth: 1,
      borderTopColor: colors.hairline,
      backgroundColor: colors.bg,
    } as ViewStyle,
  };
}
