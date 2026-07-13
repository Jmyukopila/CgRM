// Evidencia fotográfica y de vídeo: miniaturas, captura y borrado.
//
// El vídeo se abre en el navegador del sistema en vez de incrustar un reproductor:
// la app no lleva expo-video, y para validar un trabajo basta con poder verlo.
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { Evidence, EvidenceKind, TaskItem } from '../lib/api';
import { captureEvidence, deleteEvidence, type EvidenceTarget, type Source } from '../lib/evidence';
import { useT } from '../lib/i18n';
import { colors } from '../lib/theme';
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
      <Pressable onPress={open} style={styles.thumb}>
        {item.kind === 'foto' && item.url ? (
          <Image source={{ uri: item.url }} style={styles.thumbImage} contentFit="cover" transition={150} />
        ) : (
          <View style={[styles.thumbImage, styles.videoThumb]}>
            <Ionicons name="play-circle" size={28} color={colors.surface} />
            <Text style={styles.videoTag}>{t('evidence.videoTag')}</Text>
          </View>
        )}
      </Pressable>
      {editable && (
        <Pressable onPress={remove} style={styles.thumbDelete} hitSlop={6}>
          <Ionicons name="close" size={13} color={colors.surface} />
        </Pressable>
      )}

      <Modal visible={zoom} transparent animationType="fade" onRequestClose={() => setZoom(false)}>
        <Pressable style={styles.zoomBackdrop} onPress={() => setZoom(false)}>
          {item.url && <Image source={{ uri: item.url }} style={styles.zoomImage} contentFit="contain" />}
          <Text style={styles.zoomMeta}>{t('evidence.uploadedBy', { name: item.uploaded_by_name })}</Text>
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
    <View style={styles.strip}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbs}>
        {evidence.map((e) => (
          <Thumb key={e.id} item={e} editable={editable} onDeleted={onChange} />
        ))}

        {editable && !busy && (
          <>
            {allowsPhoto && (
              <Pressable style={styles.addButton} onPress={() => add('foto', 'camara')}>
                <Ionicons name="camera" size={20} color={colors.accent} />
                <Text style={styles.addLabel}>{t('evidence.addPhoto')}</Text>
              </Pressable>
            )}
            {allowsVideo && (
              <Pressable style={styles.addButton} onPress={() => add('video', 'camara')}>
                <Ionicons name="videocam" size={20} color={colors.accent} />
                <Text style={styles.addLabel}>{t('evidence.addVideo')}</Text>
              </Pressable>
            )}
            <Pressable style={styles.addButton} onPress={() => add(kind, 'galeria')}>
              <Ionicons name="images-outline" size={20} color={colors.inkSoft} />
              <Text style={[styles.addLabel, { color: colors.inkSoft }]}>{t('evidence.gallery')}</Text>
            </Pressable>
          </>
        )}

        {busy && (
          <View style={[styles.addButton, styles.busy]}>
            <ActivityIndicator color={colors.accent} />
            <Text style={styles.addLabel}>{t('evidence.uploading')}</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const THUMB = 64;

const styles = StyleSheet.create({
  strip: { marginTop: 10 },
  thumbs: { gap: 8, paddingRight: 8 },
  thumb: {
    width: THUMB,
    height: THUMB,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: colors.surfaceSunken,
  },
  thumbImage: { width: '100%', height: '100%' },
  videoThumb: { backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center', gap: 2 },
  videoTag: { color: colors.surface, fontSize: 9, fontWeight: '700', letterSpacing: 0.4 },
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
  },
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
  },
  busy: { borderStyle: 'solid', borderColor: colors.accentSoft },
  addLabel: { fontSize: 10, fontWeight: '700', color: colors.accent },
  zoomBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(33, 25, 18, 0.94)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    gap: 12,
  },
  zoomImage: { width: '100%', height: '80%' },
  zoomMeta: { color: colors.surface, fontSize: 13, fontWeight: '600' },
});
