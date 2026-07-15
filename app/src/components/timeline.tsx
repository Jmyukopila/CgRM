// Línea de tiempo de auditoría (GET /api/audit): reutilizada en la ficha de
// habitación y en el detalle de tarea.
import { Ionicons } from '@expo/vector-icons';
import { Text, View, ViewStyle, TextStyle } from 'react-native';
import { useT, useRelativeTime, type TKey } from '../lib/i18n';
import { typeScale, type Colors } from '../lib/theme';
import { useThemedStyles, useTheme } from '../lib/theme-context';
import type { AuditEntry } from '../lib/api';
import { Empty, SectionTitle } from './ui';

const ACTION_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  created: 'add-circle-outline',
  status: 'swap-horizontal-outline',
  assignee: 'person-outline',
  checkin: 'log-in-outline',
  checkout: 'log-out-outline',
};

function describe(entry: AuditEntry, t: (key: TKey, vars?: Record<string, string | number>) => string): string {
  const key = `history.action.${entry.action}` as TKey;
  return t(key, { from: entry.from_value ?? '—', to: entry.to_value ?? '—' });
}

export function Timeline({ entries }: { entries: AuditEntry[] }) {
  const { t } = useT();
  const relative = useRelativeTime();
  const { colors } = useTheme();
  const s = useThemedStyles(makeStyles);

  return (
    <View>
      <SectionTitle>{t('history.title')}</SectionTitle>
      {entries.length === 0 ? (
        <Empty text={t('history.empty')} icon="time-outline" />
      ) : (
        entries.map((entry) => (
          <View key={entry.id} style={s.row}>
            <Ionicons
              name={ACTION_ICON[entry.action] ?? 'ellipse-outline'}
              size={16}
              color={colors.inkSoft}
              style={{ marginTop: 2 }}
            />
            <View style={{ flex: 1 }}>
              <Text style={s.desc}>{describe(entry, t)}</Text>
              <Text style={s.meta}>
                {entry.actor_name ?? t('history.bySystem')} · {relative(entry.created_at)}
              </Text>
              {!!entry.note && <Text style={s.note}>{entry.note}</Text>}
            </View>
          </View>
        ))
      )}
    </View>
  );
}

function makeStyles(colors: Colors) {
  return {
    row: {
      flexDirection: 'row',
      gap: 10,
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: colors.hairline,
    } as ViewStyle,
    desc: { ...typeScale.body, color: colors.ink } as TextStyle,
    meta: { ...typeScale.caption, color: colors.inkFaint, marginTop: 2 } as TextStyle,
    note: { ...typeScale.caption, color: colors.inkSoft, marginTop: 2, fontStyle: 'italic' } as TextStyle,
  };
}
