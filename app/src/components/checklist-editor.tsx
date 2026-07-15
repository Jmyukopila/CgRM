// Editor de checklist: los puntos que se le van a exigir a quien haga el trabajo.
// Lo comparten la ficha de la habitación (para su checklist propia) y la asignación
// masiva (para dictar una checklist común a varios sitios de una vez).
import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, TextInput, TextStyle, View, ViewStyle } from 'react-native';
import { type ChecklistDraft } from '../lib/api';
import { useT } from '../lib/i18n';
import { type Colors } from '../lib/theme';
import { useTheme, useThemedStyles } from '../lib/theme-context';

// El ciclo del botón de evidencia: sin prueba → foto → vídeo → sin prueba. 'cualquiera'
// no se ofrece (existe en datos antiguos y en las plantillas sembradas), pero se muestra
// tal cual si un punto ya lo trae, y al pulsarlo vuelve a "sin prueba".
function nextEvidence(item: ChecklistDraft): Pick<ChecklistDraft, 'requires_evidence' | 'evidence_kind'> {
  if (!item.requires_evidence) return { requires_evidence: true, evidence_kind: 'foto' };
  if (item.evidence_kind === 'foto') return { requires_evidence: true, evidence_kind: 'video' };
  return { requires_evidence: false, evidence_kind: 'cualquiera' };
}

export function emptyChecklistItem(): ChecklistDraft {
  return { text: '', requires_evidence: false, evidence_kind: 'cualquiera', min_evidence: 1 };
}

export function ChecklistEditor({
  items,
  onChange,
}: {
  items: ChecklistDraft[];
  onChange: (items: ChecklistDraft[]) => void;
}) {
  const { t } = useT();
  const { colors } = useTheme();
  const s = useThemedStyles(makeStyles);

  const patch = (i: number, changes: Partial<ChecklistDraft>) =>
    onChange(items.map((item, idx) => (idx === i ? { ...item, ...changes } : item)));

  const evidenceLabel = (item: ChecklistDraft) => {
    if (!item.requires_evidence) return t('checklist.noEvidence');
    if (item.evidence_kind === 'video') return t('checklist.video');
    if (item.evidence_kind === 'foto') return t('checklist.photo');
    return t('checklist.anyEvidence');
  };

  return (
    <View style={{ gap: 8 }}>
      {items.map((item, i) => (
        <View key={i} style={s.row}>
          <TextInput
            style={s.input}
            placeholder={t('checklist.pointPlaceholder')}
            placeholderTextColor={colors.inkFaint}
            value={item.text}
            onChangeText={(text) => patch(i, { text })}
            multiline
          />
          <Pressable
            onPress={() => patch(i, nextEvidence(item))}
            style={[s.evidence, item.requires_evidence && s.evidenceOn]}
            hitSlop={4}
          >
            <Ionicons
              name={item.requires_evidence && item.evidence_kind === 'video' ? 'videocam' : 'camera'}
              size={14}
              color={item.requires_evidence ? colors.onAccent : colors.inkFaint}
            />
            <Text style={[s.evidenceText, item.requires_evidence && s.evidenceTextOn]}>
              {evidenceLabel(item)}
            </Text>
          </Pressable>
          <Pressable onPress={() => onChange(items.filter((_, idx) => idx !== i))} hitSlop={8}>
            <Ionicons name="close-circle" size={20} color={colors.inkFaint} />
          </Pressable>
        </View>
      ))}

      <Pressable onPress={() => onChange([...items, emptyChecklistItem()])} style={s.add}>
        <Ionicons name="add" size={16} color={colors.accent} />
        <Text style={s.addText}>{t('checklist.addPoint')}</Text>
      </Pressable>
    </View>
  );
}

function makeStyles(colors: Colors) {
  return {
    row: { flexDirection: 'row', alignItems: 'center', gap: 8 } as ViewStyle,
    input: {
      flex: 1,
      borderWidth: 1,
      borderColor: colors.hairline,
      borderRadius: 10,
      minHeight: 44,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 15,
      color: colors.ink,
      backgroundColor: colors.surface,
    } as TextStyle,
    evidence: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      borderWidth: 1,
      borderColor: colors.hairlineStrong,
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 6,
    } as ViewStyle,
    evidenceOn: { backgroundColor: colors.accent, borderColor: 'transparent' } as ViewStyle,
    evidenceText: { fontSize: 11, fontWeight: '700', color: colors.inkFaint } as TextStyle,
    evidenceTextOn: { color: colors.onAccent } as TextStyle,
    add: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 8 } as ViewStyle,
    addText: { fontSize: 14, fontWeight: '700', color: colors.accent } as TextStyle,
  };
}
