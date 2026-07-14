// Campo de texto con borde animado al enfocar y, para contraseñas, toggle mostrar/ocultar.
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleProp, TextInput, TextInputProps, ViewStyle } from 'react-native';
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { DURATION, EASE } from '../lib/motion';
import { fonts, radius, type Colors } from '../lib/theme';
import { useThemedStyles, useTheme } from '../lib/theme-context';

export function TextField({
  secureTextEntry,
  style,
  onFocus,
  onBlur,
  ...rest
}: TextInputProps & { style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  const s = useThemedStyles(makeStyles);
  const [visible, setVisible] = useState(false);
  const focusProgress = useSharedValue(0);

  const borderStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(focusProgress.value, [0, 1], [colors.hairline, colors.accent]),
  }));

  return (
    <Animated.View style={[s.wrapper, borderStyle, style]}>
      <TextInput
        style={s.input}
        placeholderTextColor={colors.inkFaint}
        secureTextEntry={secureTextEntry && !visible}
        onFocus={(e) => {
          // eslint-disable-next-line react-hooks/immutability -- mutar .value es la API de Reanimated para animar desde un event handler
          focusProgress.value = withTiming(1, { duration: DURATION.fast, easing: EASE });
          onFocus?.(e);
        }}
        onBlur={(e) => {
          // eslint-disable-next-line react-hooks/immutability -- ídem: fuera de render, en el handler de blur
          focusProgress.value = withTiming(0, { duration: DURATION.fast, easing: EASE });
          onBlur?.(e);
        }}
        {...rest}
      />
      {secureTextEntry && (
        <Pressable onPress={() => setVisible((v) => !v)} hitSlop={8} style={s.toggle}>
          <Ionicons name={visible ? 'eye-off' : 'eye'} size={20} color={colors.inkFaint} />
        </Pressable>
      )}
    </Animated.View>
  );
}

function makeStyles(colors: Colors) {
  return {
    wrapper: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderRadius: radius.sm,
      minHeight: 50,
      backgroundColor: colors.surfaceSunken,
    } as ViewStyle,
    input: {
      flex: 1,
      paddingHorizontal: 16,
      paddingVertical: 12,
      fontSize: 16,
      fontFamily: fonts.uiMedium,
      color: colors.ink,
    },
    toggle: { paddingHorizontal: 12 } as ViewStyle,
  };
}
