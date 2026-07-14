import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { router, useNavigation } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Image,
  ImageStyle,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { Button, Chip, Screen, SectionTitle, notify } from '../components/ui';
import { api, type Room } from '../lib/api';
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
  const [roomId, setRoomId] = useState<number | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [prio, setPrio] = useState('media');
  const [blocks, setBlocks] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    navigation.setOptions({ title: t('newIncident.title') });
  }, [navigation, t]);

  useEffect(() => {
    api.get<Room[]>('/api/rooms').then(setRooms).catch(() => {});
  }, []);

  const pickPhoto = async (fromCamera: boolean) => {
    const fn = fromCamera ? ImagePicker.launchCameraAsync : ImagePicker.launchImageLibraryAsync;
    if (fromCamera) {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) return;
    }
    const result = await fn({ mediaTypes: ['images'], quality: 0.4, base64: true });
    if (!result.canceled && result.assets[0]?.base64) {
      setPhoto(`data:image/jpeg;base64,${result.assets[0].base64}`);
    }
  };

  const submit = async () => {
    if (!roomId || !title.trim()) {
      notify(t('newIncident.missingTitle'), t('newIncident.missingBody'));
      return;
    }
    setBusy(true);
    try {
      await api.post('/api/incidents', {
        room_id: roomId,
        title: title.trim(),
        description,
        priority: prio,
        blocks_room: blocks,
        photo,
      });
      if (router.canGoBack()) router.back();
      else router.replace('/(tabs)/incidencias');
    } catch (e: any) {
      notify(t('common.error'), e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <ScrollView style={s.screen} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
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
          placeholderTextColor={colors.inkSoft}
          value={title}
          onChangeText={setTitle}
        />
        <TextInput
          style={[s.input, { minHeight: 80, textAlignVertical: 'top', marginTop: 8 }]}
          placeholder={t('newIncident.detailsPlaceholder')}
          placeholderTextColor={colors.inkSoft}
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
            thumbColor="#fff"
          />
        </View>

        <SectionTitle>{t('newIncident.photo')}</SectionTitle>
        {photo ? (
          <View>
            <Image source={{ uri: photo }} style={s.photo} />
            <Pressable onPress={() => setPhoto(null)} style={s.removePhoto}>
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
