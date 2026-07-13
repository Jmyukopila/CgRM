import { useNavigation } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, SectionTitle, notify } from '../components/ui';
import { api, downloadCsv, type Summary } from '../lib/api';
import { useRoomStatusMeta, useT, useTaskTypeLabels } from '../lib/i18n';
import { colors } from '../lib/theme';

export default function Reportes() {
  const navigation = useNavigation();
  const { t } = useT();
  const roomStatus = useRoomStatusMeta();
  const taskType = useTaskTypeLabels();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [exporting, setExporting] = useState<'tasks' | 'incidents' | null>(null);

  useEffect(() => {
    navigation.setOptions({ title: t('reports.title') });
  }, [navigation, t]);

  useEffect(() => {
    api.get<Summary>('/api/summary').then(setSummary).catch(() => {});
  }, []);

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

  if (!summary) return null;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <SectionTitle>{t('reports.roomsSummary')}</SectionTitle>
      <View style={styles.card}>
        {Object.entries(summary.roomsByStatus).map(([status, n]) => (
          <View key={status} style={styles.row}>
            <Text style={styles.rowLabel}>{roomStatus[status]?.label ?? status}</Text>
            <Text style={styles.rowValue}>{n}</Text>
          </View>
        ))}
      </View>

      <SectionTitle>{t('reports.tasksSummary')}</SectionTitle>
      <View style={styles.card}>
        {Object.entries(summary.openTasks).map(([type, n]) => (
          <View key={type} style={styles.row}>
            <Text style={styles.rowLabel}>{taskType[type] ?? type}</Text>
            <Text style={styles.rowValue}>{n}</Text>
          </View>
        ))}
      </View>

      <SectionTitle>{t('reports.incidentsOpen')}</SectionTitle>
      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>{t('reports.incidentsOpen')}</Text>
          <Text style={styles.rowValue}>{summary.openIncidents}</Text>
        </View>
      </View>

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
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 10,
    padding: 6,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
  rowLabel: { fontSize: 14, color: colors.ink, fontWeight: '600' },
  rowValue: { fontSize: 14, color: colors.ink, fontWeight: '800' },
});
