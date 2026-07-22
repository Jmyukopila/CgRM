import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, Text, TextStyle, View, ViewStyle } from 'react-native';
import { AnimatedPressable, cardShadow, Empty, ErrorState, Screen, Skeleton } from '../components/ui';
import { api, type AppNotification } from '../lib/api';
import { useRelativeTime, useT } from '../lib/i18n';
import { typeScale, type Colors } from '../lib/theme';
import { useThemedStyles, useTheme } from '../lib/theme-context';

function routeFor(n: AppNotification): string | null {
  if (!n.ref_type || !n.ref_id) return null;
  if (n.ref_type === 'task') return `/task/${n.ref_id}`;
  if (n.ref_type === 'incident') return `/incident/${n.ref_id}`;
  if (n.ref_type === 'room') return `/room/${n.ref_id}`;
  if (n.ref_type === 'inventory') return '/inventario';
  if (n.ref_type === 'lost_item') return '/objetos-perdidos';
  return null;
}

function NotificationRow({ item, onOpen }: { item: AppNotification; onOpen: () => void }) {
  const relative = useRelativeTime();
  const { colors } = useTheme();
  const s = useThemedStyles(makeStyles);
  const unread = !item.read_at;
  return (
    <AnimatedPressable onPress={onOpen} style={[s.row, unread && { backgroundColor: colors.accentSoft }]}>
      <View style={{ flex: 1 }}>
        <Text style={s.title}>{item.title}</Text>
        {!!item.body && <Text style={s.body}>{item.body}</Text>}
        <Text style={s.meta}>{relative(item.created_at)}</Text>
      </View>
      {unread && <View style={s.dot} />}
    </AnimatedPressable>
  );
}

export default function Notificaciones() {
  const { t } = useT();
  const { colors } = useTheme();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get<{ items: AppNotification[]; unread_count: number }>('/api/notifications');
      setItems(res.items);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoaded(true);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const open = async (n: AppNotification) => {
    if (!n.read_at) {
      setItems((prev) => prev.map((i) => (i.id === n.id ? { ...i, read_at: new Date().toISOString() } : i)));
      api.patch('/api/notifications/read', { ids: [n.id] }).catch(() => {});
    }
    const path = routeFor(n);
    if (path) router.push(path as never);
  };

  const markAllRead = async () => {
    setItems((prev) => prev.map((i) => ({ ...i, read_at: i.read_at ?? new Date().toISOString() })));
    try {
      await api.patch('/api/notifications/read', {});
    } catch {
      // best-effort: la próxima carga corrige el estado si falló
    }
  };

  const hasUnread = items.some((i) => !i.read_at);

  return (
    <Screen>
      {!loaded && (
        <View style={{ padding: 16, gap: 10 }}>
          <Skeleton variant="card" height={64} />
          <Skeleton variant="card" height={64} />
        </View>
      )}
      {loaded && error && (
        <View style={{ flex: 1, justifyContent: 'center', padding: 16 }}>
          <ErrorState text={t('common.connectionError')} retryLabel={t('common.retry')} onRetry={load} />
        </View>
      )}
      {loaded && !error && (
        <FlatList
          data={items}
          keyExtractor={(i) => String(i.id)}
          contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
          ListHeaderComponent={
            hasUnread ? (
              <Pressable onPress={markAllRead} style={{ marginBottom: 8 }}>
                <Text style={{ color: colors.accent, fontWeight: '700', fontSize: 13 }}>{t('notif.markAllRead')}</Text>
              </Pressable>
            ) : null
          }
          ListEmptyComponent={<Empty text={t('notif.empty')} icon="notifications-outline" />}
          renderItem={({ item }) => <NotificationRow item={item} onOpen={() => open(item)} />}
        />
      )}
    </Screen>
  );
}

function makeStyles(colors: Colors) {
  return {
    row: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.hairline,
      borderRadius: 14,
      padding: 14,
      marginBottom: 8,
      ...cardShadow(colors),
    } as ViewStyle,
    title: { ...typeScale.bodyStrong, color: colors.ink } as TextStyle,
    body: { ...typeScale.body, color: colors.inkSoft, marginTop: 2 } as TextStyle,
    meta: { ...typeScale.caption, color: colors.inkFaint, marginTop: 4 } as TextStyle,
    dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent, marginTop: 6 } as ViewStyle,
  };
}
