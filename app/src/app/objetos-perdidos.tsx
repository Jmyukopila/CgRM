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
import { Button, Empty, ErrorState, Pill, Screen, Skeleton, notify } from '../components/ui';
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

function pad(n: number) {
  return String(n).padStart(2, '0');
}

// El usuario solo puede teclear dígitos: el ":" se inserta solo, así nunca queda una
// hora a medio escribir en un formato raro.
function formatTimeInput(raw: string) {
  const digits = raw.replace(/\D/g, '').slice(0, 4);
  return digits.length <= 2 ? digits : `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

function isValidTime(v: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
}

type LocationMode = 'zone' | 'room' | null;

function emptyForm(name: string) {
  const now = new Date();
  return {
    name: '',
    description: '',
    condition: '',
    foundByName: name,
    locationMode: null as LocationMode,
    zoneRoomId: null as number | null,
    roomNumber: '',
    foundAtText: `${pad(now.getHours())}:${pad(Math.floor(now.getMinutes() / 5) * 5)}`,
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
  const [locationOpen, setLocationOpen] = useState(false);
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

  const zones = useMemo(() => rooms.filter((r) => r.type === 'zona_comun'), [rooms]);
  const privateRooms = useMemo(() => rooms.filter((r) => r.type === 'privada'), [rooms]);

  const matchedRoom = useMemo(() => {
    if (form.locationMode === 'zone') return rooms.find((r) => r.id === form.zoneRoomId) ?? null;
    if (form.locationMode === 'room') {
      const q = form.roomNumber.trim().toLowerCase();
      return q ? privateRooms.find((r) => r.name.toLowerCase() === q) ?? null : null;
    }
    return null;
  }, [form.locationMode, form.zoneRoomId, form.roomNumber, rooms, privateRooms]);

  const locationLabel =
    form.locationMode === 'zone'
      ? zones.find((z) => z.id === form.zoneRoomId)?.name ?? t('lost.pickLocation')
      : form.locationMode === 'room'
        ? t('lost.roomOption')
        : t('lost.pickLocation');

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

  const timeValid = isValidTime(form.foundAtText);
  const valid =
    !!form.name.trim() &&
    !!form.description.trim() &&
    !!form.foundByName.trim() &&
    !!matchedRoom &&
    timeValid;

  const create = async () => {
    if (!valid || !matchedRoom) return;
    setCreating(true);
    try {
      const item = await api.post<LostItem>('/api/lost-items', {
        room_id: matchedRoom.id,
        name: form.name.trim(),
        description: form.description.trim(),
        condition: form.condition.trim(),
        found_by_name: form.foundByName.trim(),
        found_at: form.foundAtText,
      });
      if (form.asset) {
        try {
          await uploadLostItemPhoto(item.id, form.asset);
        } catch {
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
          <Button label={t('lost.new')} icon="add-circle-outline" onPress={openModal} />
          <Pressable onPress={() => setShowAll((v) => !v)} style={s.toggle} hitSlop={8}>
            <Text style={s.toggleText}>{showAll ? t('lost.showAll') : t('lost.showOpen')}</Text>
          </Pressable>
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
                <View style={{ gap: 6, flex: 1 }}>
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
              <Pressable onPress={() => setLocationOpen(true)} style={s.selectBox}>
                <Text style={[s.selectBoxText, !form.locationMode && { color: colors.inkFaint }]} numberOfLines={1}>
                  {locationLabel}
                </Text>
                <Ionicons name="chevron-down" size={16} color={colors.inkSoft} />
              </Pressable>
              {form.locationMode === 'room' && (
                <>
                  <TextInput
                    style={s.input}
                    placeholder={t('lost.roomNumberPlaceholder')}
                    placeholderTextColor={colors.inkFaint}
                    keyboardType="number-pad"
                    value={form.roomNumber}
                    onChangeText={(v) => setForm((f) => ({ ...f, roomNumber: v }))}
                  />
                  {form.roomNumber.trim().length > 0 && !matchedRoom && (
                    <Text style={s.errorText}>{t('lost.roomNumberInvalid')}</Text>
                  )}
                </>
              )}

              <Text style={s.label}>{t('lost.foundAt')}</Text>
              <TextInput
                style={s.input}
                placeholder="00:00"
                placeholderTextColor={colors.inkFaint}
                keyboardType="number-pad"
                maxLength={5}
                value={form.foundAtText}
                onChangeText={(v) => setForm((f) => ({ ...f, foundAtText: formatTimeInput(v) }))}
              />
              {form.foundAtText.length > 0 && !timeValid && (
                <Text style={s.errorText}>{t('lost.timeInvalid')}</Text>
              )}

              <Button label={t('lost.new')} onPress={create} loading={creating} disabled={!valid} />
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={locationOpen} transparent animationType="fade" onRequestClose={() => setLocationOpen(false)}>
        <Pressable style={s.backdrop} onPress={() => setLocationOpen(false)}>
          <Pressable style={s.panel} onPress={() => {}}>
            <Text style={s.panelTitle}>{t('lost.room')}</Text>
            <ScrollView contentContainerStyle={{ gap: 2 }}>
              <Pressable
                style={s.locationRow}
                onPress={() => {
                  setForm((f) => ({ ...f, locationMode: 'room', zoneRoomId: null }));
                  setLocationOpen(false);
                }}
              >
                <Ionicons name="bed-outline" size={18} color={colors.inkSoft} />
                <Text style={s.locationRowText}>{t('lost.roomOption')}</Text>
              </Pressable>
              {zones.map((z) => (
                <Pressable
                  key={z.id}
                  style={s.locationRow}
                  onPress={() => {
                    setForm((f) => ({ ...f, locationMode: 'zone', zoneRoomId: z.id, roomNumber: '' }));
                    setLocationOpen(false);
                  }}
                >
                  <Ionicons name="location-outline" size={18} color={colors.inkSoft} />
                  <Text style={s.locationRowText}>{z.name}</Text>
                </Pressable>
              ))}
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
      gap: 8,
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
    errorText: { fontSize: 12, color: colors.danger, fontWeight: '600' } as TextStyle,
    selectBox: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderWidth: 1,
      borderColor: colors.hairline,
      borderRadius: 10,
      minHeight: 48,
      paddingHorizontal: 14,
      backgroundColor: colors.surface,
    } as ViewStyle,
    selectBoxText: { flex: 1, fontSize: 16, color: colors.ink } as TextStyle,
    toggle: { minHeight: 32, justifyContent: 'center' } as ViewStyle,
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
    locationRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 12,
      borderTopWidth: 1,
      borderTopColor: colors.hairline,
    } as ViewStyle,
    locationRowText: { fontSize: 15, fontWeight: '600', color: colors.ink } as TextStyle,
  };
}
