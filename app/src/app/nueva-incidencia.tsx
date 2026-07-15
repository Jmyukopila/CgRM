import { Ionicons } from '@expo/vector-icons';
import { Image, type ImageStyle } from 'expo-image';
import type * as ImagePicker from 'expo-image-picker';
import { router, useNavigation } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { Button, Chip, ErrorState, Screen, SectionTitle, Skeleton, notify } from '../components/ui';
import { api, type Incident, type Room } from '../lib/api';
import { pickAsset, uploadAsset } from '../lib/evidence';
import { usePriorityMeta, useT } from '../lib/i18n';
import { type Colors } from '../lib/theme';
import { useThemedStyles, useTheme } from '../lib/theme-context';

export default function NuevaIncidencia() {
  const navigation = useNavigation();
  const { t } = useT();
  const { colors } = useTheme();
  const s = useThemedStyles(makeStyles);
  const priority = usePriorityMeta();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [roomId, setRoomId] = useState<number | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [prio, setPrio] = useState('media');
  const [blocks, setBlocks] = useState(false);
  // Se guarda el asset elegido (no se sube todavía: la incidencia aún no existe).
  const [photoAsset, setPhotoAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    navigation.setOptions({ title: t('newIncident.title') });
  }, [navigation, t]);

  const loadRooms = () => {
    api
      .get<Room[]>('/api/rooms')
      .then((r) => {
        setRooms(r);
        setLoadError(false);
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoaded(true));
  };

  useEffect(loadRooms, []);

  const pickPhoto = async (fromCamera: boolean) => {
    try {
      const asset = await pickAsset('foto', fromCamera ? 'camara' : 'galeria');
      if (asset) setPhotoAsset(asset);
    } catch (e: any) {
      notify(t('common.error'), e.message);
    }
  };

  const submit = async () => {
    if (!roomId || !title.trim()) {
      notify(t('newIncident.missingTitle'), t('newIncident.missingBody'));
      return;
    }
    setBusy(true);
    try {
      const incident = await api.post<Incident>('/api/incidents', {
        room_id: roomId,
        title: title.trim(),
        description,
        priority: prio,
        blocks_room: blocks,
      });
      // La foto se sube al flujo firmado de evidencias, ya con la incidencia creada;
      // un fallo aquí no debe perder la incidencia ya registrada.
      if (photoAsset) {
        try {
          await uploadAsset('foto', photoAsset, { incident_id: incident.id });
        } catch (e: any) {
          notify(t('common.error'), e.message);
        }
      }
      if (router.canGoBack()) router.back();
      else router.replace('/(tabs)/incidencias');
    } catch (e: any) {
      notify(t('common.error'), e.message);
    } finally {
      setBusy(false);
    }
  };

  if (!loaded) {
    return (
      <Screen>
        <View style={{ padding: 16, gap: 10 }}>
          <Skeleton variant="card" height={120} />
          <Skeleton variant="card" height={80} />
        </View>
      </Screen>
    );
  }

  if (loadError) {
    return (
      <Screen>
        <View style={{ flex: 1, justifyContent: 'center', padding: 16 }}>
          <ErrorState text={t('common.connectionError')} retryLabel={t('common.retry')} onRetry={loadRooms} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={s.screen}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
      >
        <SectionTitle>{t('newIncident.roomZone')}</SectionTitle>
        <View style={s.chips}>
          {rooms.map((r) => (
            <Chip key={r.id} label={r.name} active={roomId === r.id} onPress={() => setRoomId(r.id)} />
          ))}
        </View>

        <SectionTitle>{t('newIncident.what')}</SectionTitle>
        <TextInput
          style={s.input}
          placeholder={t('newIncident.whatPlaceholder')}
          placeholderTextColor={colors.inkFaint}
          value={title}
          onChangeText={setTitle}
        />
        <TextInput
          style={[s.input, { minHeight: 80, textAlignVertical: 'top', marginTop: 8 }]}
          placeholder={t('newIncident.detailsPlaceholder')}
          placeholderTextColor={colors.inkFaint}
          value={description}
          onChangeText={setDescription}
          multiline
        />

        <SectionTitle>{t('newIncident.priority')}</SectionTitle>
        <View style={s.chips}>
          {Object.entries(priority).map(([key, p]) => (
            <Chip key={key} label={p.label} color={p.color} active={prio === key} onPress={() => setPrio(key)} />
          ))}
        </View>

        <View style={s.blockRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.blockTitle}>{t('newIncident.blockTitle')}</Text>
            <Text style={s.blockHint}>{t('newIncident.blockHint')}</Text>
          </View>
          <Switch
            value={blocks}
            onValueChange={setBlocks}
            trackColor={{ true: colors.danger, false: colors.hairline }}
            thumbColor={colors.onAccent}
          />
        </View>

        <SectionTitle>{t('newIncident.photo')}</SectionTitle>
        {photoAsset ? (
          <View>
            <Image source={{ uri: photoAsset.uri }} style={s.photo} contentFit="cover" />
            <Pressable onPress={() => setPhotoAsset(null)} style={s.removePhoto}>
              <Ionicons name="close-circle" size={28} color={colors.danger} />
            </Pressable>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Button label={t('newIncident.camera')} icon="camera-outline" kind="ghost" onPress={() => pickPhoto(true)} />
            </View>
            <View style={{ flex: 1 }}>
              <Button label={t('newIncident.gallery')} icon="images-outline" kind="ghost" onPress={() => pickPhoto(false)} />
            </View>
          </View>
        )}

        <View style={{ marginTop: 24 }}>
          <Button label={t('newIncident.submit')} onPress={submit} loading={busy} />
        </View>
      </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function makeStyles(colors: Colors) {
  return {
    screen: { flex: 1 } as ViewStyle,
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 } as ViewStyle,
    input: {
      borderWidth: 1,
      borderColor: colors.hairline,
      borderRadius: 10,
      minHeight: 48,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 16,
      color: colors.ink,
      backgroundColor: colors.surface,
    } as TextStyle,
    blockRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginTop: 20,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.hairline,
      borderRadius: 10,
      padding: 14,
    } as ViewStyle,
    blockTitle: { fontSize: 15, fontWeight: '700', color: colors.ink } as TextStyle,
    blockHint: { fontSize: 12, color: colors.inkSoft } as TextStyle,
    photo: { width: '100%', height: 220, borderRadius: 10 } as ImageStyle,
    removePhoto: { position: 'absolute', top: 8, right: 8 } as ViewStyle,
  };
}
