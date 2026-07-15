import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { ImageStyle, KeyboardAvoidingView, Platform, Pressable, Text, TextStyle, View, ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TextField } from '../components/form';
import { Button, cardShadow } from '../components/ui';
import { useAuth } from '../lib/auth';
import { useT } from '../lib/i18n';
import { useFadeSlideIn } from '../lib/motion';
import { radius, typeScale, type Colors } from '../lib/theme';
import { useThemedStyles, useTheme } from '../lib/theme-context';

export default function Login() {
  const { user, loading, login } = useAuth();
  const { t } = useT();
  const { colors, resolved } = useTheme();
  const s = useThemedStyles(makeStyles);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Entrada escalonada: wordmark -> campos -> botón.
  const wordmarkAnim = useFadeSlideIn(0);
  const fieldsAnim = useFadeSlideIn(120);
  const buttonAnim = useFadeSlideIn(220);
  const errorAnim = useFadeSlideIn(0);

  if (!loading && user) return <Redirect href="/(tabs)" />;

  const submit = async () => {
    setError('');
    setBusy(true);
    try {
      await login(username, password);
    } catch (e: any) {
      setError(e.message ?? t('login.error'));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setBusy(false);
    }
  };

  // Degradado diagonal de tres paradas: ancla en `bg`, respira por `accentSoft` y
  // vuelve a oscurecer hacia las esquinas — un fondo editorial, no una mancha plana.
  const gradientColors: [string, string, string] =
    resolved === 'dark'
      ? [colors.bg, colors.accentSoft, '#0B0906']
      : [colors.bg, colors.accentSoft, colors.bg];

  return (
    <LinearGradient
      colors={gradientColors}
      start={{ x: 0.1, y: 0 }}
      end={{ x: 0.9, y: 1 }}
      style={{ flex: 1 }}
    >
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={s.card}>
            <Animated.View style={wordmarkAnim}>
              <Text style={s.kicker}>{t('login.subtitle')}</Text>
              <Image
                source={require('../../assets/images/brand/logo-wordmark.svg')}
                style={s.wordmark}
                contentFit="contain"
                // El lockup es monocromo caramelo; sobre fondo oscuro la marca pide la variante blanca.
                tintColor={resolved === 'dark' ? colors.onAccent : undefined}
                accessibilityLabel="Casa Gracia"
              />
            </Animated.View>

            <Animated.View style={[s.fields, fieldsAnim]}>
              <TextField
                placeholder={t('login.username')}
                autoCapitalize="none"
                autoCorrect={false}
                value={username}
                onChangeText={setUsername}
              />
              <TextField
                placeholder={t('login.password')}
                secureTextEntry
                value={password}
                onChangeText={setPassword}
                onSubmitEditing={submit}
              />
            </Animated.View>

            {error ? (
              <Animated.View style={[s.errorBox, errorAnim]}>
                <Ionicons name="alert-circle" size={16} color={colors.danger} />
                <Text style={s.errorText}>{error}</Text>
              </Animated.View>
            ) : null}

            <Animated.View style={buttonAnim}>
              <Button label={t('login.submit')} onPress={submit} loading={busy} disabled={!username || !password} />
              <Pressable onPress={() => router.push('/registro')} hitSlop={8} style={s.registerLink}>
                <Text style={s.registerLinkText}>{t('login.noAccount')}</Text>
              </Pressable>
            </Animated.View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

function makeStyles(colors: Colors) {
  return {
    screen: {
      flex: 1,
      justifyContent: 'center',
      padding: 24,
    } as ViewStyle,
    card: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.hairline,
      borderRadius: radius.lg,
      padding: 32,
      gap: 16,
      width: '100%',
      maxWidth: 420,
      alignSelf: 'center',
      ...cardShadow(colors),
    } as ViewStyle,
    // Overline editorial sobre la marca: la etiqueta de "qué es esto" antes del logo,
    // no debajo — así el lockup entra como una firma, no como un icono con caption.
    kicker: {
      ...typeScale.label,
      color: colors.accent,
      textAlign: 'center',
      marginBottom: 10,
    } as TextStyle,
    // Proporción del SVG (988x296 ≈ 3.34:1). Antes 240x72: se notaba muy poco sobre
    // el degradado de fondo, así que crece a lo más grande que cabe en la tarjeta (420
    // de maxWidth, 32 de padding a cada lado).
    wordmark: {
      width: 340,
      height: 102,
      alignSelf: 'center',
    } as ImageStyle,
    fields: { gap: 12, marginTop: 18 } as ViewStyle,
    errorBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: colors.dangerSoft,
      borderRadius: radius.sm,
      padding: 10,
    } as ViewStyle,
    errorText: { ...typeScale.caption, color: colors.danger, flex: 1 } as TextStyle,
    registerLink: { alignItems: 'center', paddingVertical: 10, marginTop: 4 } as ViewStyle,
    registerLinkText: { ...typeScale.caption, color: colors.accent } as TextStyle,
  };
}
