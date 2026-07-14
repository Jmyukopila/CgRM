import { Ionicons } from '@expo/vector-icons';
import { router, useNavigation } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, Switch, Text, TextStyle, View, ViewStyle } from 'react-native';
import { Button, Card, Chip, Pill, Screen, SectionTitle, notify } from '../components/ui';
import { api, type Room } from '../lib/api';
import { useAuth } from '../lib/auth';
import { usePriorityMeta, useT, useTaskTypeLabels } from '../lib/i18n';
import { AREA_OF_TYPE, canSupervise } from '../lib/permissions';
import { type Colors } from '../lib/theme';
import { useThemedStyles, useTheme } from '../lib/theme-context';
import { groupByFloor } from '../lib/utils';

const TASK_TYPES = ['limpieza', 'inspeccion', 'mantenimiento', 'recepcion', 'cocina', 'lavanderia'];
const FREQUENCIES = ['diaria', 'semanal', 'mensual'] as const;
type Frequency = (typeof FREQUENCIES)[number];
const RUN_HOURS = ['06:00', '08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00'];

export default function NuevaTareaMasiva() {
  const navigation = useNavigation();
  const { t } = useT();
  const { user } = useAuth();
  const { colors } = useTheme();
  const s = useThemedStyles(makeStyles);
  const priority = usePriorityMeta();
  const taskType = useTaskTypeLabels();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  // Solo el trabajo de las áreas que uno supervisa.
  const creatableTypes = TASK_TYPES.filter((k) => canSupervise(user, AREA_OF_TYPE[k]));
  const [type, setType] = useState<string>(creatableTypes[0] ?? 'limpieza');
  const [prio, setPrio] = useState('media');
  const [recurrent, setRecurrent] = useState(false);
  const [freq, setFreq] = useState<Frequency>('diaria');
  const [hours, setHours] = useState<Set<string>>(new Set(['10:00']));
  const [configOpen, setConfigOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  const freqLabels: Record<Frequency, string> = {
    diaria: t('bulk.freq.diaria'),
    semanal: t('bulk.freq.semanal'),
    mensual: t('bulk.freq.mensual'),
  };

  useEffect(() => {
    navigation.setOptions({ title: t('bulk.title') });
  }, [navigation, t]);

  useEffect(() => {
    api.get<Room[]>('/api/rooms').then(setRooms).catch(() => {});
  }, []);

  const byFloor = useMemo(() => groupByFloor(rooms), [rooms]);

  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleFloor = (floorRooms: Room[]) => {
    const allSelected = floorRooms.every((r) => selected.has(r.id));
    setSelected((prev) => {
      const next = new Set(prev);
      for (const r of floorRooms) {
        if (allSelected) next.delete(r.id);
        else next.add(r.id);
      }
      return next;
    });
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

  const submit = async () => {
    if (selected.size === 0) {
      notify(t('bulk.missingTitle'), t('bulk.missingBody'));
      return;
    }
    setCreating(true);
    try {
      if (recurrent) {
        await api.post('/api/task-schedules', {
          room_ids: [...selected],
          type,
          priority: prio,
          freq,
          run_hours: [...hours].map((h) => parseInt(h, 10)),
        });
      } else {
        await api.post('/api/tasks', { room_ids: [...selected], type, priority: prio });
      }
      setConfigOpen(false);
      if (router.canGoBack()) router.back();
      else router.replace('/(tabs)/tareas');
    } catch (e: any) {
      notify(t('common.error'), e.message);
    } finally {
      setCreating(false);
    }
  };

  const recurrenceSummary = recurrent
    ? `${freqLabels[freq]} · ${[...hours].sort().join(' · ')}`
    : t('bulk.oneTime');

  return (
    <Screen>
      <ScrollView style={s.screen} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <SectionTitle>{t('bulk.summary')}</SectionTitle>
        <Card style={s.summary}>
          <View style={s.summaryRow}>
            <Ionicons name="briefcase-outline" size={18} color={colors.inkSoft} />
            <Text style={s.summaryText}>{taskType[type]}</Text>
          </View>
          <View style={s.summaryRow}>
            <Ionicons name="flag-outline" size={18} color={colors.inkSoft} />
            <Pill label={priority[prio].label} color={priority[prio].color} />
          </View>
          <View style={s.summaryRow}>
            <Ionicons name="bed-outline" size={18} color={colors.inkSoft} />
            <Text style={s.summaryText}>{t('bulk.selectedCount', { n: selected.size })}</Text>
          </View>
          <View style={s.summaryRow}>
            <Ionicons name="repeat-outline" size={18} color={colors.inkSoft} />
            <Text style={s.summaryText}>{recurrenceSummary}</Text>
          </View>
        </Card>

        <View style={{ marginTop: 16 }}>
          <Button label={t('bulk.configure')} onPress={() => setConfigOpen(true)} />
        </View>
      </ScrollView>

      <Modal
        visible={configOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setConfigOpen(false)}
      >
        <View style={s.backdrop}>
          <Pressable style={{ flex: 1 }} onPress={() => setConfigOpen(false)} />
          <View style={s.sheet}>
            <View style={s.sheetHandle} />
            <View style={s.sheetHeader}>
              <Text style={s.sheetTitle}>{t('bulk.configure')}</Text>
              <Pressable onPress={() => setConfigOpen(false)} hitSlop={8}>
                <Ionicons name="close" size={22} color={colors.inkSoft} />
              </Pressable>
            </View>

            <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ paddingBottom: 8 }}>
              <SectionTitle>{t('room.newTask')}</SectionTitle>
              <View style={s.chips}>
                {creatableTypes.map((k) => (
                  <Chip key={k} label={taskType[k]} active={type === k} onPress={() => setType(k)} />
                ))}
              </View>

              <SectionTitle>{t('newIncident.priority')}</SectionTitle>
              <View style={s.chips}>
                {Object.entries(priority).map(([key, p]) => (
                  <Chip key={key} label={p.label} color={p.color} active={prio === key} onPress={() => setPrio(key)} />
                ))}
              </View>

              <SectionTitle>{`${t('bulk.rooms')} · ${t('bulk.selectedCount', { n: selected.size })}`}</SectionTitle>
              {byFloor.map(([floor, list]) => {
                const allSelected = list.every((r) => selected.has(r.id));
                return (
                  <View key={floor} style={{ marginBottom: 10 }}>
                    <Pressable onPress={() => toggleFloor(list)} style={s.floorHeader}>
                      <Text style={s.floorTitle}>{floor}</Text>
                      <Text style={s.floorAction}>{allSelected ? t('bulk.deselectAll') : t('bulk.selectAll')}</Text>
                    </Pressable>
                    <View style={s.chips}>
                      {list.map((r) => (
                        <Chip key={r.id} label={r.name} active={selected.has(r.id)} onPress={() => toggle(r.id)} />
                      ))}
                    </View>
                  </View>
                );
              })}

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

                  <SectionTitle>{t('bulk.hours')}</SectionTitle>
                  <View style={s.chips}>
                    {RUN_HOURS.map((h) => (
                      <Chip key={h} label={h} active={hours.has(h)} onPress={() => toggleHour(h)} />
                    ))}
                  </View>
                </>
              )}
            </ScrollView>

            <View style={s.sheetFooter}>
              <Button
                label={t('bulk.submit', { n: selected.size })}
                onPress={submit}
                loading={creating}
                disabled={selected.size === 0}
              />
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

function makeStyles(colors: Colors) {
  return {
    screen: { flex: 1 } as ViewStyle,
    summary: { gap: 12 } as ViewStyle,
    summaryRow: { flexDirection: 'row', alignItems: 'center', gap: 10 } as ViewStyle,
    summaryText: { fontSize: 15, fontWeight: '600', color: colors.ink } as TextStyle,
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 } as ViewStyle,
    floorHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 } as ViewStyle,
    floorTitle: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.inkSoft,
      textTransform: 'uppercase',
      letterSpacing: 1,
    } as TextStyle,
    floorAction: { fontSize: 12, fontWeight: '700', color: colors.accent } as TextStyle,
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
    switchRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: 20,
      paddingVertical: 4,
    } as ViewStyle,
    switchLabel: { fontSize: 15, fontWeight: '700', color: colors.ink } as TextStyle,
    sheetFooter: { marginTop: 12 } as ViewStyle,
  };
}
