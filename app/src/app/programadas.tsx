import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, Text, TextStyle, View, ViewStyle } from 'react-native';
import { Button, Empty, Pill, Screen, notify, confirmAction } from '../components/ui';
import { api, type ScheduleFreq, type TaskSchedule } from '../lib/api';
import { usePriorityMeta, useT, useTaskTypeLabels } from '../lib/i18n';
import { type Colors } from '../lib/theme';
import { useThemedStyles, useTheme } from '../lib/theme-context';

export default function Programadas() {
  const navigation = useNavigation();
  const { t } = useT();
  const { colors } = useTheme();
  const s = useThemedStyles(makeStyles);
  const priority = usePriorityMeta();
  const taskType = useTaskTypeLabels();
  const [schedules, setSchedules] = useState<TaskSchedule[]>([]);

  const freqLabels: Record<ScheduleFreq, string> = {
    una_vez: t('bulk.freq.una_vez'),
    diaria: t('bulk.freq.diaria'),
    semanal: t('bulk.freq.semanal'),
    mensual: t('bulk.freq.mensual'),
  };

  const load = useCallback(async () => {
    try {
      setSchedules(await api.get<TaskSchedule[]>('/api/task-schedules'));
    } catch {
      // reintento manual
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      navigation.setOptions({ title: t('schedules.title') });
      load();
    }, [navigation, t, load])
  );

  const cancel = async (schedule: TaskSchedule) => {
    const ok = await confirmAction(
      t('schedules.cancelConfirmTitle'),
      t('schedules.cancelConfirmBody'),
      t('schedules.cancel')
    );
    if (!ok) return;
    try {
      await api.del(`/api/task-schedules/${schedule.id}`);
      await load();
    } catch (e: any) {
      notify(t('common.error'), e.message);
    }
  };

  return (
    <Screen>
      <ScrollView style={s.screen} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {schedules.length === 0 && <Empty text={t('schedules.empty')} icon="repeat-outline" />}
        {schedules.map((sch) => (
          <View key={sch.id} style={s.card}>
            <View style={s.cardHeader}>
              <Text style={s.roomName}>{sch.room_name}</Text>
              <Pill label={priority[sch.priority]?.label ?? sch.priority} color={priority[sch.priority]?.color ?? colors.inkSoft} />
            </View>
            <Text style={s.meta}>{taskType[sch.type] ?? sch.type}</Text>
            <View style={s.freqRow}>
              <Ionicons name="repeat-outline" size={14} color={colors.inkSoft} />
              <Text style={s.meta}>
                {freqLabels[sch.freq]} · {t('schedules.hours', { hours: [...sch.run_hours].sort((a, b) => a - b).map((h) => `${String(h).padStart(2, '0')}:00`).join(' · ') })}
              </Text>
            </View>
            {sch.date_to && <Text style={s.meta}>{t('schedules.until', { date: sch.date_to })}</Text>}
            <Text style={s.meta}>{sch.assignee_name ?? t('common.unassigned')}</Text>
            <View style={s.actions}>
              <Button label={t('schedules.cancel')} kind="danger" onPress={() => cancel(sch)} />
            </View>
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}

function makeStyles(colors: Colors) {
  return {
    screen: { flex: 1 } as ViewStyle,
    card: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.hairline,
      borderRadius: 14,
      padding: 14,
      marginBottom: 10,
      gap: 4,
    } as ViewStyle,
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' } as ViewStyle,
    roomName: { fontSize: 16, fontWeight: '800', color: colors.ink } as TextStyle,
    meta: { fontSize: 12, color: colors.inkSoft } as TextStyle,
    freqRow: { flexDirection: 'row', alignItems: 'center', gap: 6 } as ViewStyle,
    actions: { flexDirection: 'row', gap: 8, marginTop: 8 } as ViewStyle,
  };
}
