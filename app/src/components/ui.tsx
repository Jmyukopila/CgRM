// Piezas base del sistema: chips de estado, botones, tarjetas, filas y estados de carga.
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import type { ReactNode } from 'react';
import { useEffect } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  StyleProp,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DURATION, EASE, useFadeSlideIn, usePopIn, usePressScale, useShimmer } from '../lib/motion';
import { fonts, radius, typeScale, type Colors } from '../lib/theme';
import { useThemedStyles, useTheme } from '../lib/theme-context';

// Elevación única del sistema: solo la usan las tarjetas y el botón primario
// (acción elevada); todo lo demás queda plano a propósito. Función de `colors`
// porque el tinte de la sombra cambia entre modo claro y oscuro.
export function cardShadow(colors: Colors) {
  return {
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 2,
  } as const;
}

// Alert.alert no hace nada en web; unifica el aviso en todas las plataformas.
export function notify(title: string, message?: string) {
  if (Platform.OS === 'web') window.alert(message ? `${title}\n${message}` : title);
  else Alert.alert(title, message);
}

// Confirmación destructiva (borrar evidencia, devolver trabajo…), también unificada.
export function confirmAction(
  title: string,
  message: string,
  confirmLabel: string,
  cancelLabel: string
): Promise<boolean> {
  if (Platform.OS === 'web') {
    return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  }
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: cancelLabel, style: 'cancel', onPress: () => resolve(false) },
      { text: confirmLabel, style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
}

export function Pill({ label, color, soft }: { label: string; color: string; soft?: string }) {
  const { colors } = useTheme();
  return (
    <View style={[pillStyles.pill, { backgroundColor: soft ?? color }]}>
      <Text style={[pillStyles.pillText, { color: soft ? color : colors.onAccent }]}>{label}</Text>
    </View>
  );
}

const pillStyles = {
  pill: {
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  } as ViewStyle,
  pillText: { fontFamily: fonts.uiBold, fontSize: 12, letterSpacing: 0.2 } as TextStyle,
};

// Tarjeta base: superficie + borde sutil + sombra cálida. Sustituye a los
// bloques `borderWidth/borderColor: hairline` repetidos pantalla a pantalla.
export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const s = useThemedStyles(makeSharedStyles);
  return <View style={[s.card, style]}>{children}</View>;
}

export function Button({
  label,
  onPress,
  kind = 'primary',
  color,
  disabled,
  loading,
  icon,
}: {
  label: string;
  onPress: () => void;
  kind?: 'primary' | 'ghost' | 'danger';
  color?: string;
  disabled?: boolean;
  loading?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  const { colors } = useTheme();
  const s = useThemedStyles(makeSharedStyles);
  const { style: scaleStyle, onPressIn, onPressOut } = usePressScale();

  const bg = kind === 'primary' ? (color ?? colors.accent) : kind === 'danger' ? colors.danger : 'transparent';
  const bgPressed = kind === 'primary' ? (color ? bg : colors.accentPressed) : bg;

  const handlePressIn = () => {
    onPressIn();
    if (!disabled && !loading) {
      Haptics.impactAsync(kind === 'danger' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light);
    }
  };

  return (
    <Animated.View style={scaleStyle}>
      <Pressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={onPressOut}
        disabled={disabled || loading}
        style={({ pressed }) => [
          s.button,
          kind === 'primary' && cardShadow(colors),
          { backgroundColor: pressed ? bgPressed : bg, opacity: disabled ? 0.4 : pressed && kind !== 'primary' ? 0.7 : 1 },
          kind === 'ghost' && { borderWidth: 1, borderColor: colors.hairlineStrong },
        ]}
      >
        {loading ? (
          <ActivityIndicator color={kind === 'ghost' ? colors.ink : colors.onAccent} />
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {icon && <Ionicons name={icon} size={18} color={kind === 'ghost' ? colors.ink : colors.onAccent} />}
            <Text style={[s.buttonText, { color: kind === 'ghost' ? colors.ink : colors.onAccent }]}>{label}</Text>
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

// Chip de selección (habitación, prioridad, hora…). Sin `color`, el activo usa
// relleno `ink` con texto `bg` — en modo oscuro `ink` es un tono claro, así que un
// blanco fijo quedaría invisible; con `color` (p.ej. una prioridad), el propio tono
// ya está elegido para leerse bien con texto blanco encima (ver lib/theme.ts).
export function Chip({
  label,
  active,
  onPress,
  color,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  color?: string;
}) {
  const { colors } = useTheme();
  const s = useThemedStyles(makeSharedStyles);
  return (
    <Pressable
      onPress={onPress}
      style={[
        s.chip,
        active && (color ? { backgroundColor: color, borderColor: 'transparent' } : s.chipActive),
      ]}
    >
      <Text style={[s.chipText, active && { color: color ? colors.onAccent : colors.bg }]}>{label}</Text>
    </Pressable>
  );
}

export function SectionTitle({ children }: { children: string }) {
  const s = useThemedStyles(makeSharedStyles);
  return <Text style={s.sectionTitle}>{children}</Text>;
}

export function Empty({ text, icon }: { text: string; icon?: keyof typeof Ionicons.glyphMap }) {
  const { colors } = useTheme();
  const s = useThemedStyles(makeSharedStyles);
  const pop = usePopIn(100);
  return (
    <View style={s.emptyWrap}>
      {icon && (
        <Animated.View style={pop}>
          <Ionicons name={icon} size={34} color={colors.inkFaint} />
        </Animated.View>
      )}
      <Text style={s.empty}>{text}</Text>
    </View>
  );
}

// Estado de error de carga (servidor caído, sin red…), distinto de "vacío": sin esto
// una lista sin conexión se ve idéntica a una lista sin contenido.
export function ErrorState({
  text,
  retryLabel,
  onRetry,
}: {
  text: string;
  retryLabel: string;
  onRetry: () => void;
}) {
  const { colors } = useTheme();
  const s = useThemedStyles(makeSharedStyles);
  const pop = usePopIn(100);
  return (
    <View style={s.emptyWrap}>
      <Animated.View style={pop}>
        <Ionicons name="cloud-offline-outline" size={34} color={colors.inkFaint} />
      </Animated.View>
      <Text style={s.empty}>{text}</Text>
      <Pressable onPress={onRetry} hitSlop={8}>
        <Text style={{ color: colors.accent, fontWeight: '700', fontSize: 13, marginTop: 4 }}>{retryLabel}</Text>
      </Pressable>
    </View>
  );
}

// Envoltura raíz de pantalla: fondo de tema + fade-in de contenido. El header
// (Stack/Tabs) ya reserva el borde superior, así que solo se protege el inferior.
export function Screen({
  children,
  style,
  slideFrom = 'up',
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  slideFrom?: 'up' | 'down';
}) {
  const { colors } = useTheme();
  const fade = useFadeSlideIn(0, slideFrom);
  return (
    <SafeAreaView
      edges={['bottom', 'left', 'right']}
      style={[{ flex: 1, backgroundColor: colors.bg }, style]}
    >
      <Animated.View style={[{ flex: 1 }, fade]}>{children}</Animated.View>
    </SafeAreaView>
  );
}

type SkeletonVariant = 'text' | 'card' | 'circle';

// Placeholder de carga con shimmer, para sustituir los `if (!x) return null` iniciales.
export function Skeleton({
  variant = 'text',
  width,
  height,
  style,
}: {
  variant?: SkeletonVariant;
  width?: number | `${number}%`;
  height?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const shimmer = useShimmer();

  const shape: ViewStyle =
    variant === 'circle'
      ? { width: height ?? 40, height: height ?? 40, borderRadius: 999 }
      : variant === 'card'
        ? { width: width ?? '100%', height: height ?? 84, borderRadius: 14 }
        : { width: width ?? '100%', height: height ?? 14, borderRadius: 6 };

  return <Animated.View style={[shape, { backgroundColor: colors.hairlineStrong }, shimmer, style]} />;
}

// Iniciales sobre un círculo de color; el color por rol/área lo decide quien lo usa.
export function Avatar({ name, color, size = 44 }: { name: string; color?: string; size?: number }) {
  const { colors } = useTheme();
  const initials =
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join('') || '?';

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color ?? colors.accent,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: colors.onAccent, fontFamily: fonts.uiBold, fontSize: size * 0.38 }}>{initials}</Text>
    </View>
  );
}

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
}

// Control animado de 2-3 opciones (tema, idioma): el thumb se desliza a la opción activa.
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (v: T) => void;
}) {
  const { colors } = useTheme();
  const s = useThemedStyles(makeSharedStyles);
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  const progress = useSharedValue(index);

  useEffect(() => {
    progress.value = withTiming(index, { duration: DURATION.base, easing: EASE });
  }, [index, progress]);

  const thumbStyle = useAnimatedStyle(() => ({
    left: `${(progress.value / options.length) * 100}%`,
  }));

  return (
    <View style={s.segmentedTrack}>
      <Animated.View
        style={[s.segmentedThumb, { width: `${100 / options.length}%`, backgroundColor: colors.ink }, thumbStyle]}
      />
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            style={s.segmentedItem}
            onPress={() => {
              Haptics.selectionAsync();
              onChange(opt.value);
            }}
          >
            {opt.icon && (
              <Ionicons name={opt.icon} size={14} color={active ? colors.onAccent : colors.inkSoft} />
            )}
            <Text style={[s.segmentedText, active && { color: colors.onAccent }]}>{opt.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// Press-scale + haptics genérico para filas de lista pulsables.
export function AnimatedPressable({
  children,
  onPress,
  onLongPress,
  style,
  haptic = true,
}: {
  children: ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  style?: StyleProp<ViewStyle>;
  haptic?: boolean;
}) {
  const { style: scaleStyle, onPressIn, onPressOut } = usePressScale(0.98);
  return (
    <Animated.View style={scaleStyle}>
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        onPressIn={() => {
          onPressIn();
          if (haptic) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }}
        onPressOut={onPressOut}
        style={style}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}

function makeSharedStyles(colors: Colors) {
  return {
    card: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.hairline,
      borderRadius: radius.md,
      padding: 14,
      ...cardShadow(colors),
    } as ViewStyle,
    button: {
      minHeight: 48,
      borderRadius: radius.md,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 18,
    } as ViewStyle,
    buttonText: { fontFamily: fonts.uiBold, fontSize: 15 } as TextStyle,
    sectionTitle: {
      ...typeScale.label,
      color: colors.inkSoft,
      marginTop: 20,
      marginBottom: 8,
    } as TextStyle,
    emptyWrap: { alignItems: 'center', paddingVertical: 16, gap: 8 } as ViewStyle,
    empty: { ...typeScale.body, color: colors.inkSoft, textAlign: 'center' } as TextStyle,
    chip: {
      borderWidth: 1,
      borderColor: colors.hairline,
      borderRadius: radius.pill,
      paddingHorizontal: 12,
      paddingVertical: 8,
      backgroundColor: colors.surface,
    } as ViewStyle,
    chipActive: { backgroundColor: colors.ink, borderColor: 'transparent' } as ViewStyle,
    chipText: { ...typeScale.caption, color: colors.ink } as TextStyle,
    segmentedTrack: {
      flexDirection: 'row',
      backgroundColor: colors.surfaceSunken,
      borderRadius: 12,
      padding: 4,
      position: 'relative',
    } as ViewStyle,
    segmentedThumb: {
      position: 'absolute',
      top: 4,
      bottom: 4,
      borderRadius: 9,
    } as ViewStyle,
    segmentedItem: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 8,
    } as ViewStyle,
    segmentedText: { ...typeScale.caption, color: colors.ink } as TextStyle,
  };
}
