// Primitivas de Reanimated centralizadas: ninguna pantalla escribe animaciones a mano.
import { useEffect } from 'react';
import {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

export const DURATION = { fast: 150, base: 250, slow: 400 } as const;
export const EASE = Easing.out(Easing.cubic);

const STAGGER_STEP = 40;
const STAGGER_CAP = 10; // listas largas: a partir de aquí todo entra con el mismo retardo

// Retardo escalonado para listas — pasar el índice de la fila a useFadeSlideIn.
export function useStaggerDelay(index: number): number {
  return Math.min(index, STAGGER_CAP) * STAGGER_STEP;
}

// Entrada fade + slide-up sutil.
export function useFadeSlideIn(delay = 0) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(delay, withTiming(1, { duration: DURATION.base, easing: EASE }));
  }, [delay, progress]);

  return useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * 12 }],
  }));
}

// Pop-in con muelle para iconos destacados (estados vacíos, confirmaciones).
export function usePopIn(delay = 0) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(delay, withSpring(1, { damping: 12, stiffness: 160 }));
  }, [delay, progress]);

  return useAnimatedStyle(() => ({
    opacity: Math.min(progress.value, 1),
    transform: [{ scale: 0.5 + progress.value * 0.5 }],
  }));
}

// Escala al presionar; base de Button/AnimatedPressable.
export function usePressScale(scale = 0.96) {
  const pressed = useSharedValue(0);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - pressed.value * (1 - scale) }],
  }));

  const onPressIn = () => {
    pressed.value = withTiming(1, { duration: DURATION.fast, easing: EASE });
  };
  const onPressOut = () => {
    pressed.value = withTiming(0, { duration: DURATION.fast, easing: EASE });
  };

  return { style, onPressIn, onPressOut };
}

// Loop de shimmer para skeletons.
export function useShimmer() {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, [progress]);

  return useAnimatedStyle(() => ({
    opacity: 0.5 + progress.value * 0.35,
  }));
}

// Rebote de icono de tab al seleccionar.
export function useTabIconBounce(focused: boolean) {
  const scale = useSharedValue(1);

  useEffect(() => {
    if (focused) {
      scale.value = withSequence(
        withTiming(1.25, { duration: 120, easing: EASE }),
        withSpring(1, { damping: 8, stiffness: 180 })
      );
    }
  }, [focused, scale]);

  return useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
}
