// Preferencia de tema (claro/oscuro/sistema) con persistencia en AsyncStorage,
// mismo patrón que LanguageProvider en lib/i18n.tsx.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SystemUI from 'expo-system-ui';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { StyleSheet, useColorScheme, type ImageStyle, type TextStyle, type ViewStyle } from 'react-native';
import { darkColors, lightColors, makeStatusMaps, type Colors, type StatusMaps } from './theme';

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';
const STORAGE_KEY = 'cgrm.theme';

interface ThemeState {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  colors: Colors;
  statusMaps: StatusMaps;
  setPreference: (p: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeState | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>('system');

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((saved) => {
      if (saved === 'light' || saved === 'dark' || saved === 'system') setPreferenceState(saved);
    });
  }, []);

  const resolved: ResolvedTheme = preference === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : preference;
  const colors = resolved === 'dark' ? darkColors : lightColors;

  // Sincroniza fondo de sistema (status bar / nav bar / splash) para que el
  // cambio de tema no deje un flash del color del modo anterior.
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(colors.bg);
  }, [colors.bg]);

  const setPreference = (p: ThemePreference) => {
    setPreferenceState(p);
    AsyncStorage.setItem(STORAGE_KEY, p);
  };

  const statusMaps = useMemo(() => makeStatusMaps(colors), [colors]);

  return (
    <ThemeContext.Provider value={{ preference, resolved, colors, statusMaps, setPreference }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeState {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme debe usarse dentro de ThemeProvider');
  return ctx;
}

type NamedStyles<T> = { [P in keyof T]: ViewStyle | TextStyle | ImageStyle };

// Memoriza StyleSheet.create(factory(colors)): cada pantalla convierte su
// `const styles = StyleSheet.create({...})` de nivel de módulo en
// `const makeStyles = (colors) => StyleSheet.create({...})` y llama a este hook
// dentro del componente. El contenido de los estilos no cambia, solo se envuelve.
export function useThemedStyles<T extends NamedStyles<T>>(factory: (colors: Colors) => T): T {
  const { colors } = useTheme();
  const cache = useRef<{ colors: Colors; styles: T } | null>(null);
  // Memoización con invalidación por `colors`: variante segura (determinista, sin
  // side-effects) del patrón de lazy-ref-init que el linter del compilador solo
  // reconoce en su forma exacta de "una vez" (`ref.current == null`).
  /* eslint-disable react-hooks/refs */
  if (!cache.current || cache.current.colors !== colors) {
    cache.current = { colors, styles: StyleSheet.create(factory(colors)) };
  }
  return cache.current.styles;
  /* eslint-enable react-hooks/refs */
}
