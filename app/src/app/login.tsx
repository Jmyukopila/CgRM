import { Redirect } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Button, cardShadow } from '../components/ui';
import { useAuth } from '../lib/auth';
import { useT } from '../lib/i18n';
import { colors } from '../lib/theme';

export default function Login() {
  const { user, loading, login } = useAuth();
  const { t } = useT();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (!loading && user) return <Redirect href="/(tabs)" />;

  const submit = async () => {
    setError('');
    setBusy(true);
    try {
      await login(username, password);
    } catch (e: any) {
      setError(e.message ?? t('login.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.card}>
        <Text style={styles.brand}>CASA GRACIA</Text>
        <View style={styles.brandRule} />
        <Text style={styles.subtitle}>{t('login.subtitle')}</Text>

        <TextInput
          style={styles.input}
          placeholder={t('login.username')}
          placeholderTextColor={colors.inkFaint}
          autoCapitalize="none"
          autoCorrect={false}
          value={username}
          onChangeText={setUsername}
        />
        <TextInput
          style={styles.input}
          placeholder={t('login.password')}
          placeholderTextColor={colors.inkFaint}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          onSubmitEditing={submit}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button label={t('login.submit')} onPress={submit} loading={busy} disabled={!username || !password} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 16,
    padding: 28,
    gap: 12,
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    ...cardShadow,
  },
  brand: {
    fontSize: 27,
    fontWeight: '900',
    letterSpacing: 5,
    color: colors.ink,
    textAlign: 'center',
  },
  brandRule: {
    width: 40,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.accent,
    alignSelf: 'center',
    marginTop: 4,
  },
  subtitle: {
    fontSize: 13,
    color: colors.inkSoft,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 10,
    minHeight: 48,
    paddingHorizontal: 14,
    fontSize: 16,
    color: colors.ink,
    backgroundColor: colors.surfaceSunken,
  },
  error: { color: colors.danger, fontSize: 13 },
});
