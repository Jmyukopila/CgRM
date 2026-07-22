import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { useFocusEffect, useNavigation } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ImageStyle,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { Button, Chip, Empty, ErrorState, Pill, Screen, SectionTitle, Skeleton, notify } from '../components/ui';
import { pickAsset, uploadLostItemPhoto } from '../lib/evidence';
import { api, type LostItem, type Room } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useLostStatusMeta, useT } from '../lib/i18n';
import { isAtLeast } from '../lib/permissions';
import { radius, type Colors } from '../lib/theme';
import { useThemedStyles, useTheme } from '../lib/theme-context';

const STATUS_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  guardado: 'archive-outline',
  reclamado: 'hand-left-outline',
  entregado: 'checkmark-done-outline',
};

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function emptyForm(name: string) {
  const now = new Date();
  return {
    name: '',
    description: '',
    condition: '',
    foundByName: name,
    roomId: null as number | null,
    hour: now.getHours(),
    minute: Math.floor(now.getMinutes() / 5) * 5,
    asset: null as ImagePicker.ImagePickerAsset | null,
  };
}

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
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(() => emptyForm(user?.name ?? ''));
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

  const openModal = () => {
    setForm(emptyForm(user?.name ?? ''));
    setOpen(true);
  };

  const pickPhoto = async (source: 'camara' | 'galeria') => {
    try {
      const asset = await pickAsset('foto', source);
      if (asset) setForm((f) => ({ ...f, asset }));
    } catch (e: any) {
      notify(t('common.error'), e.message);
    }
  };

  const valid = form.name.trim() && form.description.trim() && form.foundByName.trim();

  const create = async () => {
    if (!valid) return;
    setCreating(true);
    try {
      const item = await api.post<LostItem>('/api/lost-items', {
        room_id: form.roomId,
        name: form.name.trim(),
        description: form.description.trim(),
        condition: form.condition.trim(),
        found_by_name: form.foundByName.trim(),
        found_at: `${pad(form.hour)}:${pad(form.minute)}`,
      });
      if (form.asset) {
        try {
          await uploadLostItemPhoto(item.id, form.asset);
        } catch (e: any) {
          notify(t('common.error'), t('lost.photoUploadFailed'));
        }
      }
      setOpen(false);
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

  const roomName = useMemo(() => {
    const m = new Map(rooms.map((r) => [r.id, r.name]));
    return (id: number | null) => (id ? m.get(id) : null);
  }, [rooms]);

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
      <View style={s.screen}>
        <View style={s.headerRow}>
          <Pressable onPress={() => setShowAll((v) => !v)} style={s.toggle} hitSlop={8}>
            <Text style={s.toggleText}>{showAll ? t('lost.showAll') : t('lost.showOpen')}</Text>
          </Pressable>
          <Button label={t('lost.new')} icon="add-circle-outline" onPress={openModal} />
        </View>

        {items.length === 0 ? (
          <Empty text={t('lost.empty')} />
        ) : (
          <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 0, gap: 8 }}>
            {items.map((item) => {
              const meta = lostStatus[item.status];
              return (
                <View key={item.id} style={s.card}>
                  <View style={s.cardHeader}>
                    {item.photo ? (
                      <Image source={{ uri: item.photo }} style={s.thumb} contentFit="cover" />
                    ) : (
                      <View style={s.thumbPlaceholder}>
                        <Ionicons name={STATUS_ICON[item.status] ?? 'help-outline'} size={20} color={colors.inkSoft} />
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={s.desc}>{item.name}</Text>
                      <Text style={s.meta} numberOfLines={2}>{item.description}</Text>
                    </View>
                    <Pill label={meta.label} color={meta.color} soft={meta.soft} />
                  </View>
                  <Text style={s.meta}>
                    {item.room_name ?? '—'} · {t('lost.foundBy')} {item.found_by_name}
                    {item.found_at ? ` · ${new Date(item.found_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}` : ''}
                  </Text>
                  {item.condition ? <Text style={s.meta}>{t('lost.condition')}: {item.condition}</Text> : null}
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
            })}
          </ScrollView>
        )}
      </View>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={s.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={s.panel} onPress={() => {}}>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 10 }}>
              <Text style={s.panelTitle}>{t('lost.new')}</Text>

              <View style={s.photoRow}>
                {form.asset ? (
                  <Image source={{ uri: form.asset.uri }} style={s.photoPreview} contentFit="cover" />
                ) : (
                  <View style={s.photoPlaceholder}>
                    <Ionicons name="image-outline" size={22} color={colors.inkFaint} />
                  </View>
                )}
                <View style={{ gap: 6 }}>
                  <Button label={t('newIncident.camera')} kind="ghost" icon="camera-outline" onPress={() => pickPhoto('camara')} />
                  <Button label={t('evidence.gallery')} kind="ghost" icon="images-outline" onPress={() => pickPhoto('galeria')} />
                </View>
              </View>

              <Text style={s.label}>{t('lost.itemName')}</Text>
              <TextInput
                style={s.input}
                placeholder={t('lost.itemNamePlaceholder')}
                placeholderTextColor={colors.inkFaint}
                value={form.name}
                onChangeText={(v) => setForm((f) => ({ ...f, name: v }))}
              />

              <Text style={s.label}>{t('lost.description')}</Text>
              <TextInput
                style={s.input}
                placeholder={t('lost.descriptionPlaceholder')}
                placeholderTextColor={colors.inkFaint}
                value={form.description}
                onChangeText={(v) => setForm((f) => ({ ...f, description: v }))}
              />

              <Text style={s.label}>{t('lost.condition')}</Text>
              <TextInput
                style={s.input}
                placeholder={t('lost.conditionPlaceholder')}
                placeholderTextColor={colors.inkFaint}
                value={form.condition}
                onChangeText={(v) => setForm((f) => ({ ...f, condition: v }))}
              />

              <Text style={s.label}>{t('lost.foundByLabel')}</Text>
              <TextInput
                style={s.input}
                placeholder={t('lost.foundByPlaceholder')}
                placeholderTextColor={colors.inkFaint}
                value={form.foundByName}
                onChangeText={(v) => setForm((f) => ({ ...f, foundByName: v }))}
              />

              <Text style={s.label}>{t('lost.room')}</Text>
              <View style={s.chips}>
                <Chip label={t('common.optional')} active={form.roomId === null} onPress={() => setForm((f) => ({ ...f, roomId: null }))} />
                {rooms.map((r) => (
                  <Chip key={r.id} label={r.name} active={form.roomId === r.id} onPress={() => setForm((f) => ({ ...f, roomId: r.id }))} />
                ))}
              </View>

              <Text style={s.label}>{t('lost.foundAt')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.timeRow}>
                {HOURS.map((h) => (
                  <Pressable
                    key={h}
                    onPress={() => setForm((f) => ({ ...f, hour: h }))}
                    style={[s.timeChip, form.hour === h && s.timeChipActive]}
                  >
                    <Text style={[s.timeChipText, form.hour === h && s.timeChipTextActive]}>{pad(h)}</Text>
                  </Pressable>
                ))}
              </ScrollView>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.timeRow}>
                {MINUTES.map((m) => (
                  <Pressable
                    key={m}
                    onPress={() => setForm((f) => ({ ...f, minute: m }))}
                    style={[s.timeChip, form.minute === m && s.timeChipActive]}
                  >
                    <Text style={[s.timeChipText, form.minute === m && s.timeChipTextActive]}>{pad(m)}</Text>
                  </Pressable>
                ))}
              </ScrollView>
              <Text style={s.timePreview}>{pad(form.hour)}:{pad(form.minute)}</Text>

              <Button label={t('lost.new')} onPress={create} loading={creating} disabled={!valid} />
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

function makeStyles(colors: Colors) {
  return {
    screen: { flex: 1 } as ViewStyle,
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 8,
    } as ViewStyle,
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
    toggle: { minHeight: 44, justifyContent: 'center' } as ViewStyle,
    toggleText: { fontSize: 12, color: colors.inkSoft, fontWeight: '600' } as TextStyle,
    card: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.hairline,
      borderRadius: 10,
      padding: 14,
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
    desc: { fontSize: 15, fontWeight: '700', color: colors.ink } as TextStyle,
    meta: { fontSize: 12, color: colors.inkSoft } as TextStyle,
    actions: { flexDirection: 'row', gap: 8, marginTop: 8 } as ViewStyle,
    backdrop: {
      flex: 1,
      backgroundColor: colors.overlay,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
    } as ViewStyle,
    panel: {
      width: '100%',
      maxWidth: 420,
      maxHeight: '85%',
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      padding: 18,
    } as ViewStyle,
    panelTitle: { fontSize: 18, fontWeight: '800', color: colors.ink, marginBottom: 4 } as TextStyle,
    photoRow: { flexDirection: 'row', gap: 12, alignItems: 'center' } as ViewStyle,
    photoPreview: { width: 64, height: 64, borderRadius: 10, backgroundColor: colors.surfaceSunken } as ImageStyle,
    photoPlaceholder: {
      width: 64,
      height: 64,
      borderRadius: 10,
      backgroundColor: colors.surfaceSunken,
      alignItems: 'center',
      justifyContent: 'center',
    } as ViewStyle,
    timeRow: { flexDirection: 'row' } as ViewStyle,
    timeChip: {
      borderWidth: 1,
      borderColor: colors.hairline,
      borderRadius: radius.pill,
      paddingHorizontal: 12,
      paddingVertical: 6,
      marginRight: 6,
      backgroundColor: colors.surfaceSunken,
    } as ViewStyle,
    timeChipActive: { backgroundColor: colors.ink, borderColor: 'transparent' } as ViewStyle,
    timeChipText: { fontSize: 13, fontWeight: '600', color: colors.ink } as TextStyle,
    timeChipTextActive: { color: colors.onAccent } as TextStyle,
    timePreview: { fontSize: 13, color: colors.inkSoft, fontWeight: '700', textAlign: 'center' } as TextStyle,
  };
}
