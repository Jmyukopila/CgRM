import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useFocusEffect, useNavigation } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  FlatList,
  ImageStyle,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { Button, Chip, Empty, ErrorState, Pill, Screen, SectionTitle, Skeleton, notify } from '../components/ui';
import { api, type LostItem, type Room } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useLostStatusMeta, useT } from '../lib/i18n';
import { isAtLeast } from '../lib/permissions';
import { type Colors } from '../lib/theme';
import { useThemedStyles, useTheme } from '../lib/theme-context';

const STATUS_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  guardado: 'archive-outline',
  reclamado: 'hand-left-outline',
  entregado: 'checkmark-done-outline',
};

export default function ObjetosPerdidos() {
  const navigation = useNavigation();
  const { user } = useAuth();
  const { t } = useT();
  const { colors } = useTheme();
  const s = useThemedStyles(makeStyles);
  const lostStatus = useLostStatusMeta();
  const canManage = isAtLeast(user, 'jefe');
  const [items, setItems] = useState<LostItem[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [description, setDescription] = useState('');
  const [roomId, setRoomId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    navigation.setOptions({ title: t('lost.title') });
  }, [navigation, t]);

  const load = useCallback(async () => {
    try {
      const q = showAll ? '' : '?status=abiertos';
      const [list, roomList] = await Promise.all([
        api.get<LostItem[]>(`/api/lost-items${q}`),
        api.get<Room[]>('/api/rooms'),
      ]);
      setItems(list);
      setRooms(roomList);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoaded(true);
    }
  }, [showAll]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const create = async () => {
    if (!description.trim()) return;
    setCreating(true);
    try {
      await api.post('/api/lost-items', { description: description.trim(), room_id: roomId });
      setDescription('');
      setRoomId(null);
      await load();
    } catch (e: any) {
      notify(t('common.error'), e.message);
    } finally {
      setCreating(false);
    }
  };

  const updateStatus = async (item: LostItem, status: LostItem['status']) => {
    try {
      await api.patch(`/api/lost-items/${item.id}`, { status });
      await load();
    } catch (e: any) {
      notify(t('common.error'), e.message);
    }
  };

  if (!loaded) {
    return (
      <Screen>
        <View style={{ padding: 16, gap: 10 }}>
          <Skeleton variant="card" height={140} />
          <Skeleton variant="card" height={80} />
        </View>
      </Screen>
    );
  }

  if (error) {
    return (
      <Screen>
        <View style={{ flex: 1, justifyContent: 'center', padding: 16 }}>
          <ErrorState text={t('common.connectionError')} retryLabel={t('common.retry')} onRetry={load} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <FlatList
          style={s.screen}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
          data={items}
          keyExtractor={(item) => String(item.id)}
          ListHeaderComponent={
            <>
              <SectionTitle>{t('lost.new')}</SectionTitle>
              <View style={s.form}>
                <TextInput
                  style={s.input}
                  placeholder={t('lost.descriptionPlaceholder')}
                  placeholderTextColor={colors.inkFaint}
                  value={description}
                  onChangeText={setDescription}
                />
                <Text style={s.label}>{t('lost.room')}</Text>
                <View style={s.chips}>
                  <Chip label={t('common.optional')} active={roomId === null} onPress={() => setRoomId(null)} />
                  {rooms.map((r) => (
                    <Chip key={r.id} label={r.name} active={roomId === r.id} onPress={() => setRoomId(r.id)} />
                  ))}
                </View>
                <Button label={t('lost.new')} onPress={create} loading={creating} disabled={!description.trim()} />
              </View>

              <Pressable onPress={() => setShowAll((v) => !v)} style={s.toggle} hitSlop={8}>
                <Text style={s.toggleText}>{showAll ? t('lost.showAll') : t('lost.showOpen')}</Text>
              </Pressable>
            </>
          }
          ListEmptyComponent={<Empty text={t('lost.empty')} />}
          renderItem={({ item }) => {
            const meta = lostStatus[item.status];
            return (
              <View style={s.card}>
                <View style={s.cardHeader}>
                  {item.photo ? (
                    <Image source={{ uri: item.photo }} style={s.thumb} contentFit="cover" />
                  ) : (
                    <View style={s.thumbPlaceholder}>
                      <Ionicons name={STATUS_ICON[item.status] ?? 'help-outline'} size={20} color={colors.inkSoft} />
                    </View>
                  )}
                  <Text style={s.desc}>{item.description}</Text>
                  <Pill label={meta.label} color={meta.color} soft={meta.soft} />
                </View>
                <Text style={s.meta}>
                  {item.room_name ?? '—'} · {t('lost.foundBy')} {item.found_by_name}
                </Text>
                {item.claimant ? <Text style={s.meta}>{t('lost.claimant')}: {item.claimant}</Text> : null}
                {canManage && item.status !== 'entregado' && (
                  <View style={s.actions}>
                    {item.status === 'guardado' && (
                      <Button
                        label={t('lost.markClaimed')}
                        kind="ghost"
                        onPress={() => updateStatus(item, 'reclamado')}
                      />
                    )}
                    <Button label={t('lost.markDelivered')} onPress={() => updateStatus(item, 'entregado')} />
                  </View>
                )}
              </View>
            );
          }}
        />
      </KeyboardAvoidingView>
    </Screen>
  );
}

function makeStyles(colors: Colors) {
  return {
    screen: { flex: 1 } as ViewStyle,
    form: { gap: 10 } as ViewStyle,
    label: { fontSize: 13, fontWeight: '700', color: colors.inkSoft, marginTop: 4 } as TextStyle,
    input: {
      borderWidth: 1,
      borderColor: colors.hairline,
      borderRadius: 10,
      minHeight: 48,
      paddingHorizontal: 14,
      fontSize: 16,
      color: colors.ink,
      backgroundColor: colors.surface,
    } as TextStyle,
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 } as ViewStyle,
    toggle: { minHeight: 44, justifyContent: 'center', marginTop: 8 } as ViewStyle,
    toggleText: { fontSize: 12, color: colors.inkSoft, fontWeight: '600' } as TextStyle,
    card: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.hairline,
      borderRadius: 10,
      padding: 14,
      marginBottom: 8,
      gap: 4,
    } as ViewStyle,
    cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 } as ViewStyle,
    thumb: { width: 40, height: 40, borderRadius: 8, backgroundColor: colors.surfaceSunken } as ImageStyle,
    thumbPlaceholder: {
      width: 40,
      height: 40,
      borderRadius: 8,
      backgroundColor: colors.surfaceSunken,
      alignItems: 'center',
      justifyContent: 'center',
    } as ViewStyle,
    desc: { fontSize: 15, fontWeight: '700', color: colors.ink, flex: 1 } as TextStyle,
    meta: { fontSize: 12, color: colors.inkSoft } as TextStyle,
    actions: { flexDirection: 'row', gap: 8, marginTop: 8 } as ViewStyle,
  };
}
