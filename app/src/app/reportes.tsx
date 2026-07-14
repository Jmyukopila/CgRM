import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, Text, TextStyle, View, ViewStyle } from 'react-native';
import { Button, Card, ErrorState, Screen, SectionTitle, Skeleton, notify } from '../components/ui';
import { api, downloadCsv, type Summary } from '../lib/api';
import { useRoomStatusMeta, useT, useTaskTypeLabels } from '../lib/i18n';
import { type Colors } from '../lib/theme';
import { useThemedStyles, useTheme } from '../lib/theme-context';

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
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [exporting, setExporting] = useState<'tasks' | 'incidents' | null>(null);

  useEffect(() => {
    navigation.setOptions({ title: t('reports.title') });
  }, [navigation, t]);

  const load = useCallback(async () => {
    try {
      setSummary(await api.get<Summary>('/api/summary'));
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, []);

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
  };
}
