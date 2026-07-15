// Autorregistro de empleados. Siempre crea una cuenta con rol 'empleado': jefe y
// admin se asignan a mano en la base (o desde /usuarios ya autenticado como tal).
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import {
  ImageStyle,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TextField } from '../components/form';
import { Button, cardShadow, Chip } from '../components/ui';
import { type Area } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useAreaLabels, useT } from '../lib/i18n';
import { AREAS } from '../lib/permissions';
import { radius, typeScale, type Colors } from '../lib/theme';
import { useThemedStyles, useTheme } from '../lib/theme-context';

export default function Registro() {
  const { user, loading, register } = useAuth();
  const { t } = useT();
  const { colors, resolved } = useTheme();
  const s = useThemedStyles(makeStyles);
  const areaLabels = useAreaLabels();

  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [area, setArea] = useState<Area | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (!loading && user) return <Redirect href="/(tabs)" />;

  const canSubmit = !!name.trim() && !!username.trim() && password.length >= 6 && !!area;

  const submit = async () => {
    if (!area) return;
    setError('');
    setBusy(true);
    try {
      await register({ name: name.trim(), username: username.trim(), password, area });
    } catch (e: any) {
      setError(e.message ?? t('register.error'));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setBusy(false);
    }
  };

  const gradientColors: [string, string, string] =
    resolved === 'dark'
      ? [colors.bg, colors.accentSoft, '#0B0906']
      : [colors.bg, colors.accentSoft, colors.bg];

  return (
    <LinearGradient colors={gradientColors} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={s.scrollContent} keyboardShouldPersistTaps="handled">
            <View style={s.card}>
              <Image
                source={require('../../assets/images/brand/logo-wordmark.svg')}
                style={s.wordmark}
                contentFit="contain"
                tintColor={resolved === 'dark' ? colors.onAccent : undefined}
                accessibilityLabel="Casa Gracia"
              />
              <Text style={s.title}>{t('register.title')}</Text>
              <Text style={s.subtitle}>{t('register.subtitle')}</Text>

              <View style={s.fields}>
                <TextField
                  placeholder={t('register.name')}
                  value={name}
                  onChangeText={setName}
                />
                <TextField
                  placeholder={t('register.username')}
                  autoCapitalize="none"
                  autoCorrect={false}
                  value={username}
                  onChangeText={setUsername}
                />
                <TextField
                  placeholder={t('register.password')}
                  secureTextEntry
                  value={password}
                  onChangeText={setPassword}
                />
                <Text style={s.hint}>{t('register.passwordHint')}</Text>

                <Text style={s.fieldLabel}>{t('register.area')}</Text>
                <View style={s.chips}>
                  {AREAS.map((a) => (
                    <Chip key={a} label={areaLabels[a]} active={area === a} onPress={() => setArea(a)} />
                  ))}
                </View>
              </View>

              {error ? (
                <View style={s.errorBox}>
                  <Ionicons name="alert-circle" size={16} color={colors.danger} />
                  <Text style={s.errorText}>{error}</Text>
                </View>
              ) : null}

              <Button label={t('register.submit')} onPress={submit} loading={busy} disabled={!canSubmit} />

              <Pressable onPress={() => router.back()} hitSlop={8} style={s.backLink}>
                <Text style={s.backLinkText}>{t('register.haveAccount')}</Text>
              </Pressable>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

function makeStyles(colors: Colors) {
  return {
    screen: { flex: 1 } as ViewStyle,
    scrollContent: { flexGrow: 1, justifyContent: 'center', padding: 24 } as ViewStyle,
    card: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.hairline,
      borderRadius: radius.lg,
      padding: 32,
      gap: 14,
      width: '100%',
      maxWidth: 420,
      alignSelf: 'center',
      ...cardShadow(colors),
    } as ViewStyle,
    wordmark: { width: 220, height: 66, alignSelf: 'center', marginBottom: 4 } as ImageStyle,
    title: { ...typeScale.heading, color: colors.ink, textAlign: 'center' } as TextStyle,
    subtitle: { ...typeScale.caption, color: colors.inkSoft, textAlign: 'center', marginTop: -6, marginBottom: 6 } as TextStyle,
    fields: { gap: 12 } as ViewStyle,
    fieldLabel: { ...typeScale.label, color: colors.inkSoft, marginTop: 4 } as TextStyle,
    hint: { ...typeScale.caption, color: colors.inkFaint, marginTop: -6 } as TextStyle,
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 } as ViewStyle,
    errorBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: colors.dangerSoft,
      borderRadius: radius.sm,
      padding: 10,
    } as ViewStyle,
    errorText: { ...typeScale.caption, color: colors.danger, flex: 1 } as TextStyle,
    backLink: { alignItems: 'center', paddingVertical: 6 } as ViewStyle,
    backLinkText: { ...typeScale.caption, color: colors.accent } as TextStyle,
  };
}
