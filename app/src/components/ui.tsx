// Piezas base del sistema: chips de estado, botones, tarjetas y filas.
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { colors } from '../lib/theme';

// Elevación única del sistema: solo la usan las tarjetas y el botón primario
// (acción elevada); todo lo demás queda plano a propósito.
export const cardShadow = {
  shadowColor: colors.shadow,
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 1,
  shadowRadius: 8,
  elevation: 2,
} as const;

// Alert.alert no hace nada en web; unifica el aviso en todas las plataformas.
export function notify(title: string, message?: string) {
  if (Platform.OS === 'web') window.alert(message ? `${title}\n${message}` : title);
  else Alert.alert(title, message);
}

// Confirmación destructiva (borrar evidencia, devolver trabajo…), también unificada.
export function confirmAction(title: string, message: string, confirmLabel: string): Promise<boolean> {
  if (Platform.OS === 'web') {
    return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  }
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'Cancelar', style: 'cancel', onPress: () => resolve(false) },
      { text: confirmLabel, style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
}

export function Pill({ label, color, soft }: { label: string; color: string; soft?: string }) {
  return (
    <View style={[styles.pill, { backgroundColor: soft ?? color }]}>
      <Text style={[styles.pillText, { color: soft ? color : '#fff' }]}>{label}</Text>
    </View>
  );
}

// Tarjeta base: superficie + borde sutil + sombra cálida. Sustituye a los
// bloques `borderWidth/borderColor: hairline` repetidos pantalla a pantalla.
export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Button({
  label,
  onPress,
  kind = 'primary',
  color,
  disabled,
  loading,
}: {
  label: string;
  onPress: () => void;
  kind?: 'primary' | 'ghost' | 'danger';
  color?: string;
  disabled?: boolean;
  loading?: boolean;
}) {
  const bg = kind === 'primary' ? (color ?? colors.accent) : kind === 'danger' ? colors.danger : 'transparent';
  const bgPressed = kind === 'primary' ? (color ? bg : colors.accentPressed) : bg;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        kind === 'primary' && cardShadow,
        { backgroundColor: pressed ? bgPressed : bg, opacity: disabled ? 0.4 : pressed && kind !== 'primary' ? 0.7 : 1 },
        kind === 'ghost' && { borderWidth: 1, borderColor: colors.hairlineStrong },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={kind === 'ghost' ? colors.ink : '#fff'} />
      ) : (
        <Text style={[styles.buttonText, kind === 'ghost' && { color: colors.ink }]}>{label}</Text>
      )}
    </Pressable>
  );
}

export function SectionTitle({ children }: { children: string }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

export function Empty({ text }: { text: string }) {
  return <Text style={styles.empty}>{text}</Text>;
}

const styles = StyleSheet.create({
  pill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  pillText: { fontSize: 12, fontWeight: '700', letterSpacing: 0.2 },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 14,
    padding: 14,
    ...cardShadow,
  },
  button: {
    minHeight: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.inkSoft,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 20,
    marginBottom: 8,
  },
  empty: { color: colors.inkSoft, fontSize: 14, paddingVertical: 16, textAlign: 'center' },
});
