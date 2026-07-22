// Piezas base del sistema: chips de estado, botones, tarjetas, filas y estados de carga.
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  StyleProp,
  Text,
  TextInput,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { subscribeOffline } from '../lib/api';
import { useT } from '../lib/i18n';
import { DURATION, EASE, useFadeSlideIn, usePopIn, usePressScale, useShimmer } from '../lib/motion';
import { fonts, radius, typeScale, type Colors } from '../lib/theme';
import { useThemedStyles, useTheme } from '../lib/theme-context';

function useOffline() {
  const [offline, setOffline] = useState(false);
  useEffect(() => subscribeOffline(setOffline), []);
  return offline;
}

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
  const { t } = useT();
  const fade = useFadeSlideIn(0, slideFrom);
  const offline = useOffline();
  return (
    <SafeAreaView
      edges={['bottom', 'left', 'right']}
      style={[{ flex: 1, backgroundColor: colors.bg }, style]}
    >
      {offline && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.warningSoft, paddingVertical: 6, paddingHorizontal: 14 }}>
          <Ionicons name="cloud-offline-outline" size={14} color={colors.warning} />
          <Text style={{ fontSize: 12, fontWeight: '700', color: colors.warning }}>{t('common.offlineBanner')}</Text>
        </View>
      )}
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
  color?: string;
}

// Control animado de 2-3 opciones (tema, idioma, prioridad, programación): el thumb se
// desliza a la opción activa. Con `color` por opción (p.ej. prioridad), el thumb adopta
// ese tono en vez del `ink` neutro por defecto — la posición se anima, el color cambia
// al vuelo (un fundido de color no aporta aquí y complica el shared value).
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

  const activeColor = options[index]?.color ?? colors.ink;

  return (
    <View style={s.segmentedTrack}>
      <Animated.View
        style={[s.segmentedThumb, { width: `${100 / options.length}%`, backgroundColor: activeColor }, thumbStyle]}
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

export interface IconOption<T extends string> {
  value: T;
  label: string;
  color: string;
  icon: keyof typeof Ionicons.glyphMap;
}

// Botón emergente para elegir entre varias opciones con icono y color propios (tipo de
// tarea / área): cerrado se ve como una sola píldora con el icono y el color de la opción
// activa; al tocarla despliega el resto en una rejilla. Pensado para listas de 4-7
// opciones, donde un slider de segmentos quedaría apretado.
export function IconPickerField<T extends string>({
  subtitle,
  value,
  options,
  onChange,
}: {
  subtitle: string;
  value: T;
  options: IconOption<T>[];
  onChange: (v: T) => void;
}) {
  const { colors } = useTheme();
  const s = useThemedStyles(makeSharedStyles);
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value) ?? options[0];

  return (
    <View>
      <Text style={s.pickerSubtitle}>{subtitle}</Text>
      <Pressable
        onPress={() => {
          Haptics.selectionAsync();
          setOpen(true);
        }}
        style={[s.pickerButton, { borderColor: current?.color ?? colors.hairline }]}
      >
        <View style={[s.pickerIconWrap, { backgroundColor: current?.color ?? colors.inkSoft }]}>
          <Ionicons name={current?.icon ?? 'apps-outline'} size={16} color={colors.onAccent} />
        </View>
        <Text style={s.pickerButtonText}>{current?.label ?? ''}</Text>
        <Ionicons name="chevron-down" size={16} color={colors.inkSoft} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={s.pickerBackdrop} onPress={() => setOpen(false)}>
          <Pressable style={s.pickerPanel} onPress={() => {}}>
            <Text style={s.pickerPanelTitle}>{subtitle}</Text>
            <View style={s.pickerGrid}>
              {options.map((opt) => {
                const active = opt.value === value;
                return (
                  <Pressable
                    key={opt.value}
                    onPress={() => {
                      Haptics.selectionAsync();
                      onChange(opt.value);
                      setOpen(false);
                    }}
                    style={[
                      s.pickerTile,
                      { borderColor: active ? opt.color : colors.hairline },
                      active && { backgroundColor: `${opt.color}1A` },
                    ]}
                  >
                    <View style={[s.pickerIconWrap, { backgroundColor: opt.color }]}>
                      <Ionicons name={opt.icon} size={18} color={colors.onAccent} />
                    </View>
                    <Text style={s.pickerTileText} numberOfLines={1}>
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

// A quién le llega una tarea: una persona concreta, un grupo elegido a mano, todo el
// mundo del área, o reparto automático. Reemplaza al viejo muro de un Chip por
// empleado — con equipos grandes eso no escala ni se busca por nombre.
export type AssignMode =
  | { mode: 'auto' }
  | { mode: 'all' }
  | { mode: 'one'; id: number }
  | { mode: 'group'; ids: number[] };

export function assignModeLabel(mode: AssignMode, staff: { id: number; name: string }[], labels: { auto: string; all: string; group: (n: number) => string }): string {
  if (mode.mode === 'auto') return labels.auto;
  if (mode.mode === 'all') return labels.all;
  if (mode.mode === 'one') return staff.find((m) => m.id === mode.id)?.name ?? '—';
  return labels.group(mode.ids.length);
}

export function EmployeePicker({
  title,
  staff,
  value,
  onChange,
  allowAuto = true,
  labels,
}: {
  title: string;
  staff: { id: number; name: string; username: string }[];
  value: AssignMode;
  onChange: (v: AssignMode) => void;
  allowAuto?: boolean;
  labels: { auto: string; all: string; search: string; confirm: string; group: (n: number) => string };
}) {
  const { colors } = useTheme();
  const s = useThemedStyles(makeSharedStyles);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  // Selección en curso dentro del modal: no pisa `value` hasta confirmar.
  const [draft, setDraft] = useState<Set<number>>(new Set(value.mode === 'group' ? value.ids : value.mode === 'one' ? [value.id] : []));

  const filtered = staff.filter((m) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return m.name.toLowerCase().includes(q) || m.username.toLowerCase().includes(q);
  });

  const openPicker = () => {
    setDraft(new Set(value.mode === 'group' ? value.ids : value.mode === 'one' ? [value.id] : []));
    setQuery('');
    Haptics.selectionAsync();
    setOpen(true);
  };

  const toggle = (id: number) => {
    Haptics.selectionAsync();
    const next = new Set(draft);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setDraft(next);
  };

  const confirm = () => {
    if (draft.size === 0) onChange({ mode: 'all' });
    else if (draft.size === 1) onChange({ mode: 'one', id: [...draft][0] });
    else onChange({ mode: 'group', ids: [...draft] });
    setOpen(false);
  };

  return (
    <View>
      <Text style={s.pickerSubtitle}>{title}</Text>
      <Pressable onPress={openPicker} style={[s.pickerButton, { borderColor: colors.hairline }]}>
        <Text style={s.pickerButtonText}>{assignModeLabel(value, staff, labels)}</Text>
        <Ionicons name="chevron-down" size={16} color={colors.inkSoft} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={s.pickerBackdrop} onPress={() => setOpen(false)}>
          <Pressable style={[s.pickerPanel, s.empPanel]} onPress={() => {}}>
            <Text style={s.pickerPanelTitle}>{title}</Text>

            <View style={s.empSearchRow}>
              <Ionicons name="search-outline" size={16} color={colors.inkFaint} />
              <TextInput
                style={s.empSearchInput}
                value={query}
                onChangeText={setQuery}
                placeholder={labels.search}
                placeholderTextColor={colors.inkFaint}
                autoCapitalize="none"
              />
            </View>

            <View style={s.empChipRow}>
              {allowAuto && (
                <Pressable
                  onPress={() => {
                    Haptics.selectionAsync();
                    onChange({ mode: 'auto' });
                    setOpen(false);
                  }}
                  style={[s.chip, value.mode === 'auto' && s.chipActive]}
                >
                  <Text style={[s.chipText, value.mode === 'auto' && { color: colors.onAccent }]}>{labels.auto}</Text>
                </Pressable>
              )}
              <Pressable
                onPress={() => {
                  Haptics.selectionAsync();
                  onChange({ mode: 'all' });
                  setOpen(false);
                }}
                style={[s.chip, value.mode === 'all' && s.chipActive]}
              >
                <Text style={[s.chipText, value.mode === 'all' && { color: colors.onAccent }]}>{labels.all}</Text>
              </Pressable>
            </View>

            <View style={s.empList}>
              {filtered.map((m) => {
                const checked = draft.has(m.id);
                return (
                  <Pressable key={m.id} onPress={() => toggle(m.id)} style={s.empRow}>
                    <View style={[s.empCheckbox, checked && s.empCheckboxActive]}>
                      {checked && <Ionicons name="checkmark" size={13} color={colors.onAccent} />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.empRowName}>{m.name}</Text>
                      <Text style={s.empRowUsername}>@{m.username}</Text>
                    </View>
                  </Pressable>
                );
              })}
              {filtered.length === 0 && <Text style={s.empty}>—</Text>}
            </View>

            <Button label={labels.confirm} onPress={confirm} />
          </Pressable>
        </Pressable>
      </Modal>
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
    pickerSubtitle: {
      ...typeScale.label,
      color: colors.inkSoft,
      marginBottom: 6,
    } as TextStyle,
    pickerButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      alignSelf: 'flex-start',
      borderWidth: 1.5,
      borderRadius: radius.pill,
      paddingVertical: 6,
      paddingRight: 14,
      paddingLeft: 6,
      backgroundColor: colors.surface,
    } as ViewStyle,
    pickerButtonText: { ...typeScale.bodyStrong, color: colors.ink } as TextStyle,
    pickerIconWrap: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
    } as ViewStyle,
    pickerBackdrop: {
      flex: 1,
      backgroundColor: colors.overlay,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    } as ViewStyle,
    pickerPanel: {
      width: '100%',
      maxWidth: 380,
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      padding: 18,
      ...cardShadow(colors),
    } as ViewStyle,
    pickerPanelTitle: {
      ...typeScale.heading,
      color: colors.ink,
      marginBottom: 14,
    } as TextStyle,
    pickerGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    } as ViewStyle,
    pickerTile: {
      width: '30%',
      alignItems: 'center',
      gap: 6,
      paddingVertical: 12,
      paddingHorizontal: 4,
      borderWidth: 1.5,
      borderRadius: radius.md,
    } as ViewStyle,
    pickerTileText: { ...typeScale.caption, color: colors.ink, textAlign: 'center' } as TextStyle,
    empPanel: { maxHeight: '80%' } as ViewStyle,
    empSearchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      borderWidth: 1,
      borderColor: colors.hairline,
      borderRadius: radius.sm,
      paddingHorizontal: 12,
      paddingVertical: 8,
      backgroundColor: colors.surfaceSunken,
      marginBottom: 10,
    } as ViewStyle,
    empSearchInput: { flex: 1, ...typeScale.body, color: colors.ink, padding: 0 } as TextStyle,
    empChipRow: { flexDirection: 'row', gap: 8, marginBottom: 10 } as ViewStyle,
    empList: { gap: 2, marginBottom: 14 } as ViewStyle,
    empRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 10,
      borderTopWidth: 1,
      borderTopColor: colors.hairline,
    } as ViewStyle,
    empCheckbox: {
      width: 22,
      height: 22,
      borderRadius: 6,
      borderWidth: 1.5,
      borderColor: colors.hairline,
      alignItems: 'center',
      justifyContent: 'center',
    } as ViewStyle,
    empCheckboxActive: { backgroundColor: colors.ink, borderColor: colors.ink } as ViewStyle,
    empRowName: { ...typeScale.bodyStrong, color: colors.ink } as TextStyle,
    empRowUsername: { ...typeScale.caption, color: colors.inkSoft } as TextStyle,
  };
}
