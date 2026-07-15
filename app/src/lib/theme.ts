// Sistema de diseño "utilitario mediterráneo cálido" (boutique premium).
// Fondo piedra, tinta casi negra, un solo acento terracota; los colores de
// estado son semánticos (se escanean, no decoran) y derivan de una única
// familia de tono por estado para que el conjunto se lea como un sistema.
//
// lightColors/darkColors comparten las mismas claves: cualquier pantalla que
// consuma `useTheme().colors` funciona igual en los dos modos sin lógica propia.

export const lightColors = {
  bg: '#FAF6F0',
  surface: '#FFFFFF',
  surfaceSunken: '#F3EBDD', // wells, inputs: distingue de las tarjetas blancas
  ink: '#211C16',
  inkSoft: '#6E6459',
  inkFaint: '#8A7C6B', // placeholders, texto deshabilitado
  hairline: '#E7DECE',
  hairlineStrong: '#D8CBB4', // bordes de foco/activo en inputs

  accent: '#AB4416',
  accentPressed: '#82320F',
  accentSoft: '#F5E0CE',

  danger: '#B3261E',
  dangerSoft: '#F9DEDC',
  success: '#2E7D4F',
  successSoft: '#DDF0E4',
  warning: '#87600F',
  warningSoft: '#F6ECD4',
  info: '#1D5FA6',
  infoSoft: '#DEEAF7',
  purple: '#6B4FA1',
  purpleSoft: '#EAE3F5',

  // Sombra con tinte cálido (no negro puro) para que la elevación case con la paleta.
  shadow: 'rgba(33, 25, 18, 0.12)',
  // Texto sobre un relleno de `accent` o de un color semántico: los tonos de ambas
  // paletas se eligen para leerse en blanco encima (ver nota en darkColors).
  onAccent: '#FFFFFF',
  // Velo para hojas/modales sobre el contenido (backdrop de bottom sheets).
  overlay: 'rgba(33, 25, 18, 0.45)',
  // Fondo del visor de evidencia a pantalla completa: casi negro en los dos temas
  // a propósito — ver la foto/vídeo importa más que respetar el modo claro.
  overlayStrong: 'rgba(10, 8, 6, 0.94)',
};

// Mismo esqueleto tonal que lightColors, reescalado para fondos oscuros: los
// "color" semánticos se aclaran lo justo para leerse como texto sobre `bg`/`surface`
// oscuros y seguir superando ~4.5:1 como relleno sólido con texto blanco encima
// (botones, FAB, badges) — un compromiso deliberado entre esos dos usos, no el
// tono más brillante posible de cada matiz.
export const darkColors = {
  bg: '#171310',
  surface: '#221D18',
  surfaceSunken: '#2A241D',
  ink: '#F3ECE2',
  inkSoft: '#B8AA98',
  inkFaint: '#8C7F6E',
  hairline: '#3A322A',
  hairlineStrong: '#4A4038',

  accent: '#C25A22',
  accentPressed: '#D66B30',
  accentSoft: '#3A2415',

  danger: '#CB4038',
  dangerSoft: '#3A211E',
  success: '#357A54',
  successSoft: '#1B2E22',
  warning: '#9C6B24',
  warningSoft: '#332811',
  info: '#3E76B8',
  infoSoft: '#1C2A3A',
  purple: '#8A6BC7',
  purpleSoft: '#2C2440',

  shadow: 'rgba(0, 0, 0, 0.45)',
  onAccent: '#FFFFFF',
  overlay: 'rgba(0, 0, 0, 0.6)',
  overlayStrong: 'rgba(10, 8, 6, 0.94)',
};

export type Colors = typeof lightColors;

// Una sola familia (Roboto) para toda la app — solo varía el peso. Las claves
// coinciden con el nombre que expone @expo-google-fonts al registrar con useFonts.
export const fonts = {
  displaySemibold: 'Roboto_600SemiBold',
  displayBold: 'Roboto_700Bold',
  uiMedium: 'Roboto_500Medium',
  uiSemibold: 'Roboto_600SemiBold',
  uiBold: 'Roboto_700Bold',
} as const;

// Base 4: toda la separación del sistema es un múltiplo de esto.
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 } as const;

// Tres radios con intención (no uno solo aplicado a todo): sm en inputs/controles
// pequeños, md en tarjetas (el default de antes), lg en hojas y hero; pill solo en
// chips/badges/avatares — nunca en una tarjeta o un botón grande.
export const radius = { sm: 10, md: 14, lg: 20, pill: 999 } as const;

// Escala tipográfica. Una sola familia (Roboto) en toda la escala — la jerarquía la
// hace el peso (bold en display/title/heading, medium en body/caption) y el tamaño,
// no un cambio de fuente. El tracking negativo en los tamaños grandes es lo que hace
// que un display de 34-40px no se sienta suelto; el positivo en `label` es lo que hace
// que un texto en mayúsculas a 11px siga siendo legible.
export const typeScale = {
  display: { fontFamily: fonts.displaySemibold, fontSize: 34, lineHeight: 40, letterSpacing: -0.6 },
  title: { fontFamily: fonts.displaySemibold, fontSize: 26, lineHeight: 32, letterSpacing: -0.4 },
  heading: { fontFamily: fonts.displaySemibold, fontSize: 18, lineHeight: 24, letterSpacing: -0.2 },
  body: { fontFamily: fonts.uiMedium, fontSize: 15, lineHeight: 21, letterSpacing: 0 },
  bodyStrong: { fontFamily: fonts.uiSemibold, fontSize: 15, lineHeight: 21, letterSpacing: 0 },
  caption: { fontFamily: fonts.uiSemibold, fontSize: 13, lineHeight: 18, letterSpacing: 0.1 },
  label: {
    fontFamily: fonts.uiBold,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
} as const;

// Solo color; las etiquetas se traducen vía lib/i18n (useLabels/useMeta).
// Se recalcula por tema porque cada mapa referencia los tonos de `colors`.
export function makeStatusMaps(colors: Colors) {
  const roomStatusColor: Record<string, { color: string; soft: string }> = {
    // Rojo = sucia, verde = lista: el par que el equipo escanea más rápido en el
    // tablero de housekeeping, así que se reservan solo para esos dos extremos.
    sucia: { color: colors.danger, soft: colors.dangerSoft },
    en_limpieza: { color: colors.warning, soft: colors.warningSoft },
    pendiente_inspeccion: { color: colors.purple, soft: colors.purpleSoft },
    lista: { color: colors.success, soft: colors.successSoft },
    // Neutro a propósito: 'ocupada' no es un estado de trabajo pendiente, es "hay
    // huésped" — no debe competir visualmente con los estados que sí piden acción.
    ocupada: { color: colors.inkSoft, soft: colors.surfaceSunken },
    // 'bloqueada' no es "sucia" ni ningún paso de limpieza — es "no se puede vender".
    // Tono oscuro/neutro deliberadamente distinto del rojo para no confundirla con sucia.
    bloqueada: { color: colors.ink, soft: colors.hairlineStrong },
  };

  const taskStatusColor: Record<string, { color: string }> = {
    pendiente: { color: colors.warning },
    // Azul reservado para 'verificada' (ver más abajo); en curso usa el acento de marca.
    en_curso: { color: colors.accent },
    // "Hecha" es entregada, no aprobada: se lee como un pendiente de revisar, no como un éxito.
    hecha: { color: colors.purple },
    // Azul = verificado: el estado final de confianza, distinto del verde de "lista"
    // en habitaciones para que ambos sistemas de estado no se lean como sinónimos.
    verificada: { color: colors.info },
    rechazada: { color: colors.danger },
    cancelada: { color: colors.inkSoft },
    vencida: { color: colors.danger },
    // Impugnada: ya se dio por buena y ahora se revierte — se marca distinto de un rechazo normal.
    impugnada: { color: colors.warning },
  };

  const priorityColor: Record<string, { color: string }> = {
    baja: { color: colors.inkSoft },
    media: { color: colors.warning },
    alta: { color: colors.accent },
    urgente: { color: colors.danger },
  };

  const incidentStatusColor: Record<string, { color: string; soft: string }> = {
    abierta: { color: colors.danger, soft: colors.dangerSoft },
    en_curso: { color: colors.info, soft: colors.infoSoft },
    resuelta: { color: colors.success, soft: colors.successSoft },
  };

  const lostStatusColor: Record<string, { color: string; soft: string }> = {
    guardado: { color: colors.warning, soft: colors.warningSoft },
    reclamado: { color: colors.info, soft: colors.infoSoft },
    entregado: { color: colors.success, soft: colors.successSoft },
  };

  return { roomStatusColor, taskStatusColor, priorityColor, incidentStatusColor, lostStatusColor };
}

export type StatusMaps = ReturnType<typeof makeStatusMaps>;

// Color de identidad por rol (avatar de perfil y de la lista de usuarios): jerarquía
// visual coherente con la seriedad creciente del rol, no un color decorativo suelto.
export function roleColor(colors: Colors, role: string): string {
  switch (role) {
    case 'admin':
      return colors.danger;
    case 'jefe':
      return colors.accent;
    default:
      return colors.inkSoft;
  }
}
