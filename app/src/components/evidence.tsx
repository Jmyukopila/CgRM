// Evidencia fotográfica y de vídeo: miniaturas, captura y borrado.
//
// El vídeo se abre en el navegador del sistema en vez de incrustar un reproductor:
// la app no lleva expo-video, y para validar un trabajo basta con poder verlo.
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { ActivityIndicator, ImageStyle, Modal, Pressable, ScrollView, Text, TextStyle, View, ViewStyle } from 'react-native';
import type { Evidence, EvidenceKind, TaskItem } from '../lib/api';
import { captureEvidence, deleteEvidence, type EvidenceTarget, type Source } from '../lib/evidence';
import { useT } from '../lib/i18n';
import { type Colors } from '../lib/theme';
import { useThemedStyles, useTheme } from '../lib/theme-context';
import { confirmAction, notify } from './ui';

function Thumb({
  item,
  editable,
  onDeleted,
}: {
  item: Evidence;
  editable: boolean;
  onDeleted: () => void;
}) {
  const { t } = useT();
  const { colors } = useTheme();
  const s = useThemedStyles(makeStyles);
  const [zoom, setZoom] = useState(false);

  const open = () => {
    if (!item.url) return;
    if (item.kind === 'video') WebBrowser.openBrowserAsync(item.url);
    else setZoom(true);
  };

  const remove = async () => {
    const ok = await confirmAction(t('evidence.delete'), t('evidence.deleteConfirm'), t('evidence.delete'));
    if (!ok) return;
    try {
      await deleteEvidence(item.id);
      onDeleted();
    } catch (e: any) {
      notify(t('common.error'), e.message);
    }
  };

  return (
    <View>
      <Pressable onPress={open} style={s.thumb}>
        {item.kind === 'foto' && item.url ? (
          <Image source={{ uri: item.url }} style={s.thumbImage} contentFit="cover" transition={150} />
        ) : (
          <View style={[s.thumbImage, s.videoThumb]}>
            <Ionicons name="play-circle" size={28} color={colors.surface} />
            <Text style={s.videoTag}>{t('evidence.videoTag')}</Text>
          </View>
        )}
      </Pressable>
      {editable && (
        <Pressable onPress={remove} style={s.thumbDelete} hitSlop={6}>
          <Ionicons name="close" size={13} color={colors.surface} />
        </Pressable>
      )}

      <Modal visible={zoom} transparent animationType="fade" onRequestClose={() => setZoom(false)}>
        <Pressable style={s.zoomBackdrop} onPress={() => setZoom(false)}>
          {item.url && <Image source={{ uri: item.url }} style={s.zoomImage} contentFit="contain" />}
          <Text style={s.zoomMeta}>{t('evidence.uploadedBy', { name: item.uploaded_by_name })}</Text>
        </Pressable>
      </Modal>
    </View>
  );
}

// Tira de evidencias de un punto de checklist (o de la tarea entera, sin `item`).
export function EvidenceStrip({
  target,
  evidence,
  editable,
  requiredKind,
  onChange,
}: {
  target: EvidenceTarget;
  evidence: Evidence[];
  editable: boolean;
  // 'cualquiera' deja elegir; 'foto'/'video' fuerzan el tipo que exige el punto.
  requiredKind?: TaskItem['evidence_kind'];
  onChange: () => void;
}) {
  const { t } = useT();
  const { colors } = useTheme();
  const s = useThemedStyles(makeStyles);
  const [busy, setBusy] = useState(false);

  const add = async (kind: EvidenceKind, source: Source) => {
    setBusy(true);
    try {
      const created = await captureEvidence(kind, source, target);
      if (created) onChange();
    } catch (e: any) {
      notify(t('common.error'), e.message);
    } finally {
      setBusy(false);
    }
  };

  const kind: EvidenceKind = requiredKind === 'video' ? 'video' : 'foto';
  const allowsVideo = requiredKind !== 'foto';
  const allowsPhoto = requiredKind !== 'video';

  if (!editable && evidence.length === 0) return null;

  return (
    <View style={s.strip}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.thumbs}>
        {evidence.map((e) => (
          <Thumb key={e.id} item={e} editable={editable} onDeleted={onChange} />
        ))}

        {editable && !busy && (
          <>
            {allowsPhoto && (
              <Pressable style={s.addButton} onPress={() => add('foto', 'camara')}>
                <Ionicons name="camera" size={20} color={colors.accent} />
                <Text style={s.addLabel}>{t('evidence.addPhoto')}</Text>
              </Pressable>
            )}
            {allowsVideo && (
              <Pressable style={s.addButton} onPress={() => add('video', 'camara')}>
                <Ionicons name="videocam" size={20} color={colors.accent} />
                <Text style={s.addLabel}>{t('evidence.addVideo')}</Text>
              </Pressable>
            )}
            <Pressable style={s.addButton} onPress={() => add(kind, 'galeria')}>
              <Ionicons name="images-outline" size={20} color={colors.inkSoft} />
              <Text style={[s.addLabel, { color: colors.inkSoft }]}>{t('evidence.gallery')}</Text>
            </Pressable>
          </>
        )}

        {busy && (
          <View style={[s.addButton, s.busy]}>
            <ActivityIndicator color={colors.accent} />
            <Text style={s.addLabel}>{t('evidence.uploading')}</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const THUMB = 64;

function makeStyles(colors: Colors) {
  return {
    strip: { marginTop: 10 } as ViewStyle,
    thumbs: { gap: 8, paddingRight: 8 } as ViewStyle,
    thumb: {
      width: THUMB,
      height: THUMB,
      borderRadius: 10,
      overflow: 'hidden',
      backgroundColor: colors.surfaceSunken,
    } as ViewStyle,
    thumbImage: { width: '100%', height: '100%' } as ImageStyle,
    videoThumb: { backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center', gap: 2 } as ViewStyle,
    videoTag: { color: colors.surface, fontSize: 9, fontWeight: '700', letterSpacing: 0.4 } as TextStyle,
    thumbDelete: {
      position: 'absolute',
      top: -5,
      right: -5,
      backgroundColor: colors.danger,
      borderRadius: 999,
      width: 20,
      height: 20,
      alignItems: 'center',
      justifyContent: 'center',
    } as ViewStyle,
    addButton: {
      width: THUMB,
      height: THUMB,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.hairlineStrong,
      borderStyle: 'dashed',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 2,
      backgroundColor: colors.surface,
    } as ViewStyle,
    busy: { borderStyle: 'solid', borderColor: colors.accentSoft } as ViewStyle,
    addLabel: { fontSize: 10, fontWeight: '700', color: colors.accent } as TextStyle,
    zoomBackdrop: {
      flex: 1,
      backgroundColor: colors.overlayStrong,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
      gap: 12,
    } as ViewStyle,
    zoomImage: { width: '100%', height: '80%' } as ImageStyle,
    zoomMeta: { color: colors.surface, fontSize: 13, fontWeight: '600' } as TextStyle,
  };
}
