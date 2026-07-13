import { Ionicons } from '@expo/vector-icons';
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
import { api, type Incident } from '../../lib/api';
import { useIncidentStatusMeta, usePriorityMeta, useT } from '../../lib/i18n';
import { colors } from '../../lib/theme';

export default function Incidencias() {
  const { t } = useT();
  const INC_STATUS = useIncidentStatusMeta();
  const priority = usePriorityMeta();
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [showClosed, setShowClosed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const q = showClosed ? '' : '?status=abiertas';
      setIncidents(await api.get<Incident[]>(`/api/incidents${q}`));
    } catch {
      // reintento en el siguiente foco
    }
  }, [showClosed]);

  useFocusEffect(
    useCallback(() => {
      load();
      const interval = setInterval(load, 15000);
      return () => clearInterval(interval);
    }, [load])
  );

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 96 }}
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
            {showClosed ? t('incidents.showAll') : t('incidents.showOpen')}
          </Text>
        </Pressable>

        {incidents.length === 0 && <Empty text={t('incidents.empty')} />}

        {incidents.map((inc) => {
          const st = INC_STATUS[inc.status];
          const pr = priority[inc.priority];
          return (
            <Pressable
              key={inc.id}
              onPress={() => inc.task_id && router.push(`/task/${inc.task_id}`)}
              style={({ pressed }) => [styles.card, pressed && { opacity: 0.7 }]}
            >
              <View style={styles.cardHeader}>
                <Text style={styles.room}>{inc.room_name}</Text>
                <Pill label={st.label} color={st.color} soft={st.soft} />
              </View>
              <Text style={styles.title}>{inc.title}</Text>
              <View style={styles.cardFooter}>
                <Text style={[styles.priority, { color: pr.color }]}>
                  ● {pr.label}
                  {inc.blocks_room ? `  · ${t('incidents.blocksRoom')}` : ''}
                </Text>
                <Text style={styles.meta}>{inc.reported_by_name}</Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>

      <Pressable style={styles.fab} onPress={() => router.push('/nueva-incidencia')}>
        <Ionicons name="add" size={28} color="#fff" />
        <Text style={styles.fabText}>{t('incidents.report')}</Text>
      </Pressable>
    </View>
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
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  priority: { fontSize: 12, fontWeight: '700' },
  meta: { fontSize: 12, color: colors.inkSoft },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 24,
    backgroundColor: colors.accent,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 20,
    minHeight: 52,
    ...cardShadow,
  },
  fabText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});
