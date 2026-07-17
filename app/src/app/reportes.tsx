import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useNavigation } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, TextStyle, View, ViewStyle } from 'react-native';
import { AnimatedPressable, Button, Card, ErrorState, Pill, Screen, SectionTitle, Skeleton, notify } from '../components/ui';
import { api, type Analytics, downloadCsv, type Summary } from '../lib/api';
import { useRelativeTime, useRoomStatusMeta, useT, useTaskTypeLabels, usePriorityMeta } from '../lib/i18n';
import { type Colors } from '../lib/theme';
import { useThemedStyles, useTheme } from '../lib/theme-context';

const SPARK_CHARS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];

// La consulta solo devuelve días con cierres; para que la barra tenga forma de serie
// continua (no solo los días con datos) se rellenan los huecos con 0 en el cliente.
function last14Days(trend: Analytics['completionTrend']): { day: string; completed: number }[] {
  const byDay = new Map(trend.map((t) => [t.day, t.completed]));
  const days: { day: string; completed: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    days.push({ day: key, completed: byDay.get(key) ?? 0 });
  }
  return days;
}

function sparkline(days: { day: string; completed: number }[]): string {
  const max = Math.max(...days.map((d) => d.completed), 1);
  return days
    .map((d) => SPARK_CHARS[Math.min(SPARK_CHARS.length - 1, Math.round((d.completed / max) * (SPARK_CHARS.length - 1)))])
    .join('');
}

const TASK_TYPE_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  limpieza: 'sparkles-outline',
  mantenimiento: 'construct-outline',
  inspeccion: 'search-outline',
  recepcion: 'call-outline',
  cocina: 'restaurant-outline',
  lavanderia: 'shirt-outline',
  general: 'list-outline',
};

export default function Reportes() {
  const navigation = useNavigation();
  const { t } = useT();
  const { colors } = useTheme();
  const s = useThemedStyles(makeStyles);
  const roomStatus = useRoomStatusMeta();
  const taskType = useTaskTypeLabels();
  const priority = usePriorityMeta();
  const relative = useRelativeTime();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [exporting, setExporting] = useState<'tasks' | 'incidents' | null>(null);

  useEffect(() => {
    navigation.setOptions({ title: t('reports.title') });
  }, [navigation, t]);

  const load = useCallback(async () => {
    try {
      const [sum, an] = await Promise.all([
        api.get<Summary>('/api/summary'),
        api.get<Analytics>('/api/analytics'),
      ]);
      setSummary(sum);
      setAnalytics(an);
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, []);

  const trendDays = useMemo(() => last14Days(analytics?.completionTrend ?? []), [analytics]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const exportCsv = async (type: 'tasks' | 'incidents') => {
    setExporting(type);
    try {
      await downloadCsv(`/api/reports/export?type=${type}`, `cgrm-${type}.csv`);
      notify(t('reports.exportedTitle'), t('reports.exportedBody'));
    } catch (e: any) {
      notify(t('common.error'), e.message);
    } finally {
      setExporting(null);
    }
  };

  if (!summary) {
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
          <Skeleton variant="card" height={120} />
          <Skeleton variant="card" height={120} />
        </ScrollView>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView style={s.screen} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <SectionTitle>{t('reports.roomsSummary')}</SectionTitle>
        <Card style={{ padding: 6 }}>
          {Object.entries(summary.roomsByStatus).map(([status, n]) => (
            <View key={status} style={s.row}>
              <Text style={s.rowLabel}>{roomStatus[status]?.label ?? status}</Text>
              <Text style={s.rowValue}>{n}</Text>
            </View>
          ))}
        </Card>

        <SectionTitle>{t('reports.tasksSummary')}</SectionTitle>
        <Card style={{ padding: 6 }}>
          {Object.entries(summary.openTasks).map(([type, n]) => (
            <View key={type} style={s.row}>
              <View style={s.rowLabelGroup}>
                <Ionicons name={TASK_TYPE_ICON[type] ?? 'list-outline'} size={14} color={colors.inkSoft} />
                <Text style={s.rowLabel}>{taskType[type] ?? type}</Text>
              </View>
              <Text style={s.rowValue}>{n}</Text>
            </View>
          ))}
        </Card>

        <SectionTitle>{t('reports.incidentsOpen')}</SectionTitle>
        <Card style={{ padding: 6 }}>
          <View style={s.row}>
            <Text style={s.rowLabel}>{t('reports.incidentsOpen')}</Text>
            <Text style={s.rowValue}>{summary.openIncidents}</Text>
          </View>
          <View style={s.row}>
            <Text style={s.rowLabel}>{t('reports.pendingReview')}</Text>
            <Text style={s.rowValue}>{summary.pendingReview}</Text>
          </View>
        </Card>

        <SectionTitle>{t('reports.atRisk')}</SectionTitle>
        {!analytics || analytics.atRisk.length === 0 ? (
          <Text style={s.emptyHint}>{t('reports.atRiskEmpty')}</Text>
        ) : (
          <Card style={{ padding: 6 }}>
            {analytics.atRisk.map((task) => (
              <AnimatedPressable key={task.id} onPress={() => router.push(`/task/${task.id}`)} style={s.row}>
                <View style={{ flex: 1 }}>
                  <Text style={s.rowLabel} numberOfLines={1}>{task.title}</Text>
                  <Text style={s.rowSubtitle}>{task.room_name} · {relative(task.due_at)}</Text>
                </View>
                <Pill label={priority[task.priority]?.label ?? task.priority} color={priority[task.priority]?.color ?? colors.inkSoft} />
              </AnimatedPressable>
            ))}
          </Card>
        )}

        <SectionTitle>{t('reports.avgClose')}</SectionTitle>
        {!analytics || analytics.avgCloseHoursByArea.length === 0 ? (
          <Text style={s.emptyHint}>{t('reports.avgCloseEmpty')}</Text>
        ) : (
          <Card style={{ padding: 6 }}>
            {analytics.avgCloseHoursByArea.map((row) => (
              <View key={row.area} style={s.row}>
                <Text style={s.rowLabel}>{row.area}</Text>
                <Text style={s.rowValue}>{row.avg_hours ?? '–'} {t('reports.hours')} · {row.n}</Text>
              </View>
            ))}
          </Card>
        )}

        <SectionTitle>{t('reports.staffPerf')}</SectionTitle>
        {!analytics || analytics.staffPerformance.length === 0 ? (
          <Text style={s.emptyHint}>{t('reports.staffPerfEmpty')}</Text>
        ) : (
          <Card style={{ padding: 6 }}>
            {analytics.staffPerformance.map((row) => (
              <View key={row.id} style={s.row}>
                <Text style={s.rowLabel}>{row.name}</Text>
                <Text style={s.rowValue}>
                  {row.completed}/{row.total} · {row.avg_hours ?? '–'} {t('reports.hours')}
                  {row.ever_rejected > 0 ? ` · ${row.ever_rejected} ${t('reports.rejected')}` : ''}
                </Text>
              </View>
            ))}
          </Card>
        )}

        <SectionTitle>{t('reports.trend')}</SectionTitle>
        {!analytics || analytics.completionTrend.length === 0 ? (
          <Text style={s.emptyHint}>{t('reports.trendEmpty')}</Text>
        ) : (
          <Card style={{ padding: 14 }}>
            <Text style={s.sparkline}>{sparkline(trendDays)}</Text>
          </Card>
        )}

        <View style={{ gap: 10, marginTop: 20 }}>
          <Button
            label={t('reports.exportTasks')}
            kind="ghost"
            loading={exporting === 'tasks'}
            onPress={() => exportCsv('tasks')}
          />
          <Button
            label={t('reports.exportIncidents')}
            kind="ghost"
            loading={exporting === 'incidents'}
            onPress={() => exportCsv('incidents')}
          />
        </View>
      </ScrollView>
    </Screen>
  );
}

function makeStyles(colors: Colors) {
  return {
    screen: { flex: 1 } as ViewStyle,
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 10,
      paddingHorizontal: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.hairline,
    } as ViewStyle,
    rowLabelGroup: { flexDirection: 'row', alignItems: 'center', gap: 8 } as ViewStyle,
    rowLabel: { fontSize: 14, color: colors.ink, fontWeight: '600' } as TextStyle,
    rowValue: { fontSize: 14, color: colors.ink, fontWeight: '800' } as TextStyle,
    rowSubtitle: { fontSize: 12, color: colors.inkSoft, marginTop: 2 } as TextStyle,
    emptyHint: { fontSize: 13, color: colors.inkSoft, paddingHorizontal: 4, paddingBottom: 4 } as TextStyle,
    sparkline: { fontSize: 28, letterSpacing: 2, color: colors.accent } as TextStyle,
  };
}
