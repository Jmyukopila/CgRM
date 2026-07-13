import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Button, cardShadow } from '../../components/ui';
import { API_URL } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useAreaLabels, useT, type Lang } from '../../lib/i18n';
import { canManageOps } from '../../lib/permissions';
import { colors } from '../../lib/theme';

const GENERAL_LINKS = [{ href: '/objetos-perdidos', key: 'profile.lostItems' as const }];
const ADMIN_LINKS = [
  { href: '/inventario', key: 'profile.inventory' as const },
  { href: '/usuarios', key: 'profile.users' as const },
  { href: '/reportes', key: 'profile.reports' as const },
];

export default function Perfil() {
  const { user, logout } = useAuth();
  const { t, lang, setLang } = useT();
  const areas = useAreaLabels();
  const [busy, setBusy] = useState(false);
  if (!user) return null;

  return (
    <View style={styles.screen}>
      <View style={styles.card}>
        <Text style={styles.name}>{user.name}</Text>
        <Text style={styles.role}>
          {t(`role.${user.role}` as any)}
          {user.area ? ` · ${areas[user.area]}` : ''}
        </Text>
        <Text style={styles.meta}>{t('users.username')}: {user.username}</Text>
        <Text style={styles.meta}>{t('common.server')}: {API_URL}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionLabel}>{t('common.language')}</Text>
        <View style={styles.langRow}>
          {(['es', 'en'] as Lang[]).map((l) => (
            <Pressable
              key={l}
              onPress={() => setLang(l)}
              style={[styles.langChip, lang === l && styles.langChipActive]}
            >
              <Text style={[styles.langText, lang === l && { color: '#fff' }]}>
                {l === 'es' ? 'Español' : 'English'}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.card}>
        {GENERAL_LINKS.map((link) => (
          <Pressable key={link.href} onPress={() => router.push(link.href as any)} style={styles.linkRow}>
            <Text style={styles.linkText}>{t(link.key)}</Text>
          </Pressable>
        ))}
      </View>

      {canManageOps(user) && (
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>{t('profile.admin')}</Text>
          {ADMIN_LINKS.map((link) => (
            <Pressable key={link.href} onPress={() => router.push(link.href as any)} style={styles.linkRow}>
              <Text style={styles.linkText}>{t(link.key)}</Text>
            </Pressable>
          ))}
        </View>
      )}

      <Button
        label={t('profile.logout')}
        kind="danger"
        loading={busy}
        onPress={async () => {
          setBusy(true);
          await logout();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, padding: 16, gap: 16 },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 14,
    padding: 20,
    gap: 4,
    ...cardShadow,
  },
  name: { fontSize: 22, fontWeight: '800', color: colors.ink },
  role: { fontSize: 14, fontWeight: '600', color: colors.accent, marginBottom: 8 },
  meta: { fontSize: 13, color: colors.inkSoft },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.inkSoft,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  langRow: { flexDirection: 'row', gap: 8 },
  langChip: {
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  langChipActive: { backgroundColor: colors.ink, borderColor: 'transparent' },
  langText: { fontSize: 13, fontWeight: '700', color: colors.ink },
  linkRow: { paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.hairline },
  linkText: { fontSize: 15, fontWeight: '700', color: colors.ink },
});
