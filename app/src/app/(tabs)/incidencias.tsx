import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, Text, TextStyle, View, ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';
import { AnimatedPressable, cardShadow, Empty, ErrorState, Pill, Screen, Skeleton } from '../../components/ui';
import { api, type Incident } from '../../lib/api';
import { useIncidentStatusMeta, usePriorityMeta, useT } from '../../lib/i18n';
import { useFadeSlideIn, useStaggerDelay } from '../../lib/motion';
import { typeScale, type Colors } from '../../lib/theme';
import { useThemedStyles, useTheme } from '../../lib/theme-context';

function IncidentRow({
  inc,
  index,
  st,
  pr,
}: {
  inc: Incident;
  index: number;
  st: { label: string; color: string; soft: string };
  pr: { label: string; color: string };
}) {
  const { t } = useT();
  const s = useThemedStyles(makeStyles);
  const fade = useFadeSlideIn(useStaggerDelay(index));
  return (
    <Animated.View style={fade}>
      <AnimatedPressable onPress={() => router.push(`/incident/${inc.id}` as any)} style={s.card}>
        <View style={s.cardHeader}>
          <Text style={s.room}>{inc.room_name}</Text>
          <Pill label={st.label} color={st.color} soft={st.soft} />
        </View>
        <Text style={s.title}>{inc.title}</Text>
        <View style={s.cardFooter}>
          <Text style={[s.priority, { color: pr.color }]}>
            ● {pr.label}
            {inc.blocks_room ? `  · ${t('incidents.blocksRoom')}` : ''}
          </Text>
          <Text style={s.meta}>{inc.reported_by_name}</Text>
        </View>
      </AnimatedPressable>
    </Animated.View>
  );
}

export default function Incidencias() {
  const { t } = useT();
  const { colors } = useTheme();
  const s = useThemedStyles(makeStyles);
  const INC_STATUS = useIncidentStatusMeta();
  const priority = usePriorityMeta();
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [showClosed, setShowClosed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const q = showClosed ? '' : '?status=abiertas';
      setIncidents(await api.get<Incident[]>(`/api/incidents${q}`));
      setError(false);
    } catch {
      // reintento en el siguiente foco
      setError(true);
    } finally {
      setLoaded(true);
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
    <Screen>
      <View style={s.screen}>
        {!loaded && (
          <View style={{ padding: 16, gap: 10 }}>
            <Skeleton variant="card" height={80} />
            <Skeleton variant="card" height={80} />
          </View>
        )}
        {loaded && error && (
          <View style={{ flex: 1, justifyContent: 'center', padding: 16 }}>
            <ErrorState text={t('common.connectionError')} retryLabel={t('common.retry')} onRetry={load} />
          </View>
        )}
        {loaded && !error && (
          <FlatList
            data={incidents}
            keyExtractor={(inc) => String(inc.id)}
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
            ListHeaderComponent={
              <Pressable onPress={() => setShowClosed((v) => !v)} style={s.toggle} hitSlop={8}>
                <Text style={s.toggleText}>
                  {showClosed ? t('incidents.showAll') : t('incidents.showOpen')}
                </Text>
              </Pressable>
            }
            ListEmptyComponent={<Empty text={t('incidents.empty')} icon="shield-checkmark-outline" />}
            renderItem={({ item, index }) => (
              <IncidentRow inc={item} index={index} st={INC_STATUS[item.status]} pr={priority[item.priority]} />
            )}
          />
        )}

        <AnimatedPressable style={s.fab} onPress={() => router.push('/nueva-incidencia')}>
          <Ionicons name="add" size={28} color={colors.onAccent} />
          <Text style={s.fabText}>{t('incidents.report')}</Text>
        </AnimatedPressable>
      </View>
    </Screen>
  );
}

function makeStyles(colors: Colors) {
  return {
    screen: { flex: 1 } as ViewStyle,
    toggle: { minHeight: 44, justifyContent: 'center', marginBottom: 8 } as ViewStyle,
    toggleText: { fontSize: 12, color: colors.inkSoft, fontWeight: '600' } as TextStyle,
    card: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.hairline,
      borderRadius: 14,
      padding: 14,
      marginBottom: 10,
      gap: 4,
      ...cardShadow(colors),
    } as ViewStyle,
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' } as ViewStyle,
    room: { ...typeScale.heading, fontSize: 17, color: colors.ink } as TextStyle,
    title: { fontSize: 14, fontWeight: '600', color: colors.ink } as TextStyle,
    cardFooter: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: 4,
    } as ViewStyle,
    priority: { fontSize: 12, fontWeight: '700' } as TextStyle,
    meta: { fontSize: 12, color: colors.inkSoft } as TextStyle,
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
      justifyContent: 'center',
      ...cardShadow(colors),
    } as ViewStyle,
    fabText: { color: colors.onAccent, fontSize: 15, fontWeight: '800' } as TextStyle,
  };
}
