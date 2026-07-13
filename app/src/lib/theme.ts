// Sistema de diseño "utilitario mediterráneo cálido" (boutique premium).
// Fondo piedra, tinta casi negra, un solo acento terracota; los colores de
// estado son semánticos (se escanean, no decoran) y derivan de una única
// familia de tono por estado para que el conjunto se lea como un sistema.

export const colors = {
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

  // Sombra con tinte cálido (no negro puro) para que la elevación case con la paleta.
  shadow: 'rgba(33, 25, 18, 0.12)',
};

// Solo color; las etiquetas se traducen vía lib/i18n (useLabels/useMeta).
export const roomStatusColor: Record<string, { color: string; soft: string }> = {
  sucia: { color: colors.warning, soft: colors.warningSoft },
  en_limpieza: { color: colors.info, soft: colors.infoSoft },
  pendiente_inspeccion: { color: '#6B4FA1', soft: '#EAE3F5' },
  lista: { color: colors.success, soft: colors.successSoft },
  bloqueada: { color: colors.danger, soft: colors.dangerSoft },
};

export const taskStatusColor: Record<string, { color: string }> = {
  pendiente: { color: colors.warning },
  en_curso: { color: colors.info },
  // "Hecha" es entregada, no aprobada: se lee como un pendiente de revisar, no como un éxito.
  hecha: { color: '#6B4FA1' },
  verificada: { color: colors.success },
  rechazada: { color: colors.danger },
  cancelada: { color: colors.inkSoft },
};

export const priorityColor: Record<string, { color: string }> = {
  baja: { color: colors.inkSoft },
  media: { color: colors.warning },
  alta: { color: colors.accent },
  urgente: { color: colors.danger },
};

export const incidentStatusColor: Record<string, { color: string; soft: string }> = {
  abierta: { color: colors.danger, soft: colors.dangerSoft },
  en_curso: { color: colors.info, soft: colors.infoSoft },
  resuelta: { color: colors.success, soft: colors.successSoft },
};

export const lostStatusColor: Record<string, { color: string; soft: string }> = {
  guardado: { color: colors.warning, soft: colors.warningSoft },
  reclamado: { color: colors.info, soft: colors.infoSoft },
  entregado: { color: colors.success, soft: colors.successSoft },
};
