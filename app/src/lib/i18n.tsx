// Sistema de idioma (ES/EN) con persistencia en AsyncStorage.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  incidentStatusColor,
  lostStatusColor,
  priorityColor,
  roomStatusColor,
  taskStatusColor,
} from './theme';

export type Lang = 'es' | 'en';
const STORAGE_KEY = 'cgrm.lang';

const dict = {
  es: {
    // Común
    'common.cancel': 'Cancelar',
    'common.save': 'Guardar',
    'common.create': 'Crear',
    'common.close': 'Cerrar',
    'common.error': 'Error',
    'common.unassigned': 'Sin asignar',
    'common.send': 'Enviar',
    'common.server': 'Servidor',
    'common.language': 'Idioma',
    'common.all': 'Todas',
    'common.optional': 'opcional',

    // Roles
    'role.empleado': 'Empleado',
    'role.lider': 'Líder de área',
    'role.jefe': 'Jefe de operaciones',
    'role.admin': 'Administrador',

    // Áreas
    'area.limpieza': 'Limpieza',
    'area.mantenimiento': 'Mantenimiento',
    'area.recepcion': 'Recepción',
    'area.cocina': 'Cocina',
    'area.lavanderia': 'Lavandería',
    'area.administracion': 'Administración',
    'area.all': 'Todas las áreas',

    // Estados de habitación
    'roomStatus.sucia': 'Sucia',
    'roomStatus.en_limpieza': 'En limpieza',
    'roomStatus.pendiente_inspeccion': 'Inspección',
    'roomStatus.lista': 'Lista',
    'roomStatus.bloqueada': 'Bloqueada',

    // Tipo de habitación
    'roomType.privada': 'Privada',
    'roomType.suite': 'Suite',
    'roomType.compartida': 'Compartida',
    'roomType.zona_comun': 'Zona común',

    // Estados de tarea
    'taskStatus.pendiente': 'Pendiente',
    'taskStatus.en_curso': 'En curso',
    'taskStatus.hecha': 'Por revisar',
    'taskStatus.verificada': 'Verificada',
    'taskStatus.rechazada': 'Devuelta',
    'taskStatus.cancelada': 'Cancelada',

    // Tipo de tarea
    'taskType.limpieza': 'Limpieza',
    'taskType.mantenimiento': 'Mantenimiento',
    'taskType.inspeccion': 'Inspección',
    'taskType.recepcion': 'Recepción',
    'taskType.cocina': 'Cocina',
    'taskType.lavanderia': 'Lavandería',
    'taskType.general': 'Tarea',

    // Prioridad
    'priority.baja': 'Baja',
    'priority.media': 'Media',
    'priority.alta': 'Alta',
    'priority.urgente': 'Urgente',

    // Estados de incidencia
    'incidentStatus.abierta': 'Abierta',
    'incidentStatus.en_curso': 'En curso',
    'incidentStatus.resuelta': 'Resuelta',

    // Estados de objeto perdido
    'lostStatus.guardado': 'Guardado',
    'lostStatus.reclamado': 'Reclamado',
    'lostStatus.entregado': 'Entregado',

    // Pestañas
    'tabs.rooms': 'Habitaciones',
    'tabs.tasks': 'Tareas',
    'tabs.myTasks': 'Mis tareas',
    'tabs.incidents': 'Incidencias',
    'tabs.review': 'Revisión',
    'tabs.profile': 'Perfil',

    // Login
    'login.subtitle': 'Operaciones · limpieza · mantenimiento',
    'login.username': 'Usuario',
    'login.password': 'Contraseña',
    'login.submit': 'Entrar',
    'login.error': 'No se pudo iniciar sesión',

    // Panel de habitaciones
    'rooms.empty': 'No hay habitaciones en este estado.',

    // Detalle de habitación
    'room.changeStatus': 'Cambiar estado',
    'room.newTask': 'Nueva tarea',
    'room.createTask': 'Crear tarea',
    'room.tasksTitle': 'Tareas',
    'room.incidentsTitle': 'Incidencias',
    'room.emptyTasks': 'Sin tareas en esta habitación.',
    'room.emptyIncidents': 'Sin incidencias en esta habitación.',
    'room.open': 'Abierta',
    'room.resolved': 'Resuelta',

    // Tareas (lista)
    'tasks.empty': 'Sin tareas por ahora. ☀️',
    'tasks.showAll': 'Mostrando todas · tocar para ver solo abiertas',
    'tasks.showOpen': 'Mostrando abiertas · tocar para ver todas',
    'tasks.breakdown': 'puntos',
    'tasks.incidentTag': '(avería)',
    'tasks.bulkNew': 'Asignación masiva',

    // Detalle de tarea
    'task.checklist': 'Checklist',
    'task.startWork': 'Iniciar trabajo',
    'task.markDone': 'Marcar como hecha',
    'task.completeMissing': 'Completar (faltan {n})',
    'task.verify': 'Verificar y dar por buena',
    'task.returnToProgress': 'Devolver a en curso',
    'task.cancelTask': 'Cancelar tarea',
    'task.assignedTo': 'Esta tarea está asignada a {name}.',
    'task.fromIncident': 'Generada por una incidencia — al completarla, la incidencia queda resuelta.',
    'task.elapsed': 'Tiempo en curso',
    'task.messagesTitle': 'Mensajes',
    'task.messagePlaceholder': 'Escribe un mensaje al equipo…',
    'task.noMessages': 'Sin mensajes todavía.',

    // Evidencias
    'evidence.required': 'Requiere evidencia',
    'evidence.requiredPhoto': 'Requiere foto',
    'evidence.requiredVideo': 'Requiere vídeo',
    'evidence.requiredAny': 'Requiere foto o vídeo',
    'evidence.count': '{n}/{min}',
    'evidence.addPhoto': 'Foto',
    'evidence.addVideo': 'Vídeo',
    'evidence.gallery': 'Galería',
    'evidence.uploading': 'Subiendo…',
    'evidence.title': 'Evidencias',
    'evidence.empty': 'Sin evidencias adjuntas.',
    'evidence.delete': 'Eliminar evidencia',
    'evidence.deleteConfirm': '¿Eliminar esta evidencia? El punto quedará sin marcar.',
    'evidence.blocked': 'Adjunta la evidencia para poder marcar este punto.',
    'evidence.uploadedBy': 'Subida por {name}',
    'evidence.videoTag': 'Vídeo',

    // Revisión (líder / jefe)
    'review.title': 'Revisión',
    'review.empty': 'Nada pendiente de revisar. 🎉',
    'review.pending': '{n} por revisar',
    'review.approve': 'Verificar y dar por buena',
    'review.reject': 'Devolver al equipo',
    'review.notePlaceholder': 'Motivo de la devolución (obligatorio)…',
    'review.noteLabel': 'Nota de revisión',
    'review.needNote': 'Escribe el motivo de la devolución.',
    'review.rejectedBy': 'Devuelta por {name}',
    'review.verifiedBy': 'Verificada por {name}',
    'review.ownWork': 'No puedes revisar tu propio trabajo: lo verifica tu jefe.',
    'review.checkEvidence': 'Revisa las evidencias antes de decidir.',

    // Incidencias
    'incidents.empty': 'Ninguna incidencia abierta. 🎉',
    'incidents.showAll': 'Mostrando todas · tocar para ver solo abiertas',
    'incidents.showOpen': 'Mostrando abiertas · tocar para ver todas',
    'incidents.blocksRoom': 'bloquea habitación',
    'incidents.report': 'Reportar',

    // Nueva incidencia
    'newIncident.roomZone': 'Habitación / zona',
    'newIncident.what': 'Qué pasa',
    'newIncident.whatPlaceholder': 'Ej.: gotea el grifo del lavabo',
    'newIncident.detailsPlaceholder': 'Detalles (opcional)',
    'newIncident.priority': 'Prioridad',
    'newIncident.blockTitle': 'Bloquear habitación',
    'newIncident.blockHint': 'No se puede vender hasta resolver la avería',
    'newIncident.photo': 'Foto',
    'newIncident.camera': '📷 Cámara',
    'newIncident.gallery': '🖼 Galería',
    'newIncident.submit': 'Reportar incidencia',
    'newIncident.missingTitle': 'Faltan datos',
    'newIncident.missingBody': 'Selecciona la habitación y describe la incidencia.',

    // Perfil
    'profile.logout': 'Cerrar sesión',
    'profile.admin': 'Administración',
    'profile.lostItems': 'Objetos perdidos',
    'profile.inventory': 'Inventario',
    'profile.users': 'Usuarios',
    'profile.reports': 'Reportes',

    // Objetos perdidos
    'lost.title': 'Objetos perdidos',
    'lost.new': 'Registrar objeto',
    'lost.description': 'Descripción',
    'lost.descriptionPlaceholder': 'Ej.: cargador de móvil blanco',
    'lost.room': 'Habitación / zona (opcional)',
    'lost.claimant': 'Reclamado por',
    'lost.claimantPlaceholder': 'Nombre del huésped',
    'lost.markClaimed': 'Marcar reclamado',
    'lost.markDelivered': 'Marcar entregado',
    'lost.empty': 'No hay objetos perdidos registrados.',
    'lost.foundBy': 'Encontrado por',
    'lost.showAll': 'Mostrando todos · tocar para ver solo abiertos',
    'lost.showOpen': 'Mostrando abiertos · tocar para ver todos',

    // Inventario
    'inventory.title': 'Inventario',
    'inventory.new': 'Nuevo artículo',
    'inventory.name': 'Nombre',
    'inventory.category': 'Categoría',
    'inventory.unit': 'Unidad',
    'inventory.minQty': 'Mínimo',
    'inventory.qty': 'Stock actual',
    'inventory.lowStock': 'Bajo mínimo',
    'inventory.addStock': 'Reponer',
    'inventory.useStock': 'Consumir',
    'inventory.reasonPlaceholder': 'Motivo (opcional)',
    'inventory.empty': 'Sin artículos en el inventario.',

    // Usuarios
    'users.title': 'Usuarios',
    'users.new': 'Nuevo usuario',
    'users.username': 'Usuario',
    'users.name': 'Nombre',
    'users.password': 'Contraseña',
    'users.role': 'Rol',
    'users.area': 'Área',
    'users.deactivate': 'Desactivar',
    'users.activate': 'Activar',
    'users.empty': 'Sin usuarios.',
    'users.areaHint': 'Empleado y líder trabajan dentro de un área. Jefe y administrador las cruzan todas.',

    // Reportes
    'reports.title': 'Reportes',
    'reports.tasksSummary': 'Tareas abiertas',
    'reports.roomsSummary': 'Habitaciones por estado',
    'reports.incidentsOpen': 'Incidencias abiertas',
    'reports.exportTasks': 'Exportar tareas (CSV)',
    'reports.exportIncidents': 'Exportar incidencias (CSV)',
    'reports.exportedTitle': 'Exportado',
    'reports.exportedBody': 'El archivo CSV se ha descargado / compartido.',

    // Asignación masiva
    'bulk.title': 'Asignación masiva',
    'bulk.rooms': 'Habitaciones',
    'bulk.selectAll': 'Seleccionar todas',
    'bulk.deselectAll': 'Quitar selección',
    'bulk.selectedCount': '{n} habitaciones seleccionadas',
    'bulk.submit': 'Crear {n} tareas',
    'bulk.missingTitle': 'Faltan datos',
    'bulk.missingBody': 'Selecciona al menos una habitación.',
  },
  en: {
    'common.cancel': 'Cancel',
    'common.save': 'Save',
    'common.create': 'Create',
    'common.close': 'Close',
    'common.error': 'Error',
    'common.unassigned': 'Unassigned',
    'common.send': 'Send',
    'common.server': 'Server',
    'common.language': 'Language',
    'common.all': 'All',
    'common.optional': 'optional',

    'role.empleado': 'Staff',
    'role.lider': 'Area lead',
    'role.jefe': 'Head of operations',
    'role.admin': 'Administrator',

    'area.limpieza': 'Housekeeping',
    'area.mantenimiento': 'Maintenance',
    'area.recepcion': 'Front desk',
    'area.cocina': 'Kitchen',
    'area.lavanderia': 'Laundry',
    'area.administracion': 'Administration',
    'area.all': 'All areas',

    'roomStatus.sucia': 'Dirty',
    'roomStatus.en_limpieza': 'Cleaning',
    'roomStatus.pendiente_inspeccion': 'Inspection',
    'roomStatus.lista': 'Ready',
    'roomStatus.bloqueada': 'Blocked',

    'roomType.privada': 'Private',
    'roomType.suite': 'Suite',
    'roomType.compartida': 'Shared',
    'roomType.zona_comun': 'Common area',

    'taskStatus.pendiente': 'Pending',
    'taskStatus.en_curso': 'In progress',
    'taskStatus.hecha': 'To review',
    'taskStatus.verificada': 'Verified',
    'taskStatus.rechazada': 'Sent back',
    'taskStatus.cancelada': 'Cancelled',

    'taskType.limpieza': 'Cleaning',
    'taskType.mantenimiento': 'Maintenance',
    'taskType.inspeccion': 'Inspection',
    'taskType.recepcion': 'Front desk',
    'taskType.cocina': 'Kitchen',
    'taskType.lavanderia': 'Laundry',
    'taskType.general': 'Task',

    'priority.baja': 'Low',
    'priority.media': 'Medium',
    'priority.alta': 'High',
    'priority.urgente': 'Urgent',

    'incidentStatus.abierta': 'Open',
    'incidentStatus.en_curso': 'In progress',
    'incidentStatus.resuelta': 'Resolved',

    'lostStatus.guardado': 'Stored',
    'lostStatus.reclamado': 'Claimed',
    'lostStatus.entregado': 'Delivered',

    'tabs.rooms': 'Rooms',
    'tabs.tasks': 'Tasks',
    'tabs.myTasks': 'My tasks',
    'tabs.incidents': 'Incidents',
    'tabs.review': 'Review',
    'tabs.profile': 'Profile',

    'login.subtitle': 'Operations · housekeeping · maintenance',
    'login.username': 'Username',
    'login.password': 'Password',
    'login.submit': 'Sign in',
    'login.error': 'Could not sign in',

    'rooms.empty': 'No rooms in this state.',

    'room.changeStatus': 'Change status',
    'room.newTask': 'New task',
    'room.createTask': 'Create task',
    'room.tasksTitle': 'Tasks',
    'room.incidentsTitle': 'Incidents',
    'room.emptyTasks': 'No tasks for this room.',
    'room.emptyIncidents': 'No incidents for this room.',
    'room.open': 'Open',
    'room.resolved': 'Resolved',

    'tasks.empty': 'No tasks right now. ☀️',
    'tasks.showAll': 'Showing all · tap to show open only',
    'tasks.showOpen': 'Showing open · tap to show all',
    'tasks.breakdown': 'items',
    'tasks.incidentTag': '(incident)',
    'tasks.bulkNew': 'Bulk assign',

    'task.checklist': 'Checklist',
    'task.startWork': 'Start work',
    'task.markDone': 'Mark as done',
    'task.completeMissing': 'Complete ({n} left)',
    'task.verify': 'Verify and approve',
    'task.returnToProgress': 'Send back to in progress',
    'task.cancelTask': 'Cancel task',
    'task.assignedTo': 'This task is assigned to {name}.',
    'task.fromIncident': 'Generated from an incident — completing it resolves the incident too.',
    'task.elapsed': 'Time in progress',
    'task.messagesTitle': 'Messages',
    'task.messagePlaceholder': 'Write a message to the team…',
    'task.noMessages': 'No messages yet.',

    'evidence.required': 'Evidence required',
    'evidence.requiredPhoto': 'Photo required',
    'evidence.requiredVideo': 'Video required',
    'evidence.requiredAny': 'Photo or video required',
    'evidence.count': '{n}/{min}',
    'evidence.addPhoto': 'Photo',
    'evidence.addVideo': 'Video',
    'evidence.gallery': 'Gallery',
    'evidence.uploading': 'Uploading…',
    'evidence.title': 'Evidence',
    'evidence.empty': 'No evidence attached.',
    'evidence.delete': 'Delete evidence',
    'evidence.deleteConfirm': 'Delete this evidence? The item will be unchecked.',
    'evidence.blocked': 'Attach the evidence to check this item.',
    'evidence.uploadedBy': 'Uploaded by {name}',
    'evidence.videoTag': 'Video',

    'review.title': 'Review',
    'review.empty': 'Nothing left to review. 🎉',
    'review.pending': '{n} to review',
    'review.approve': 'Verify and approve',
    'review.reject': 'Send back to the team',
    'review.notePlaceholder': 'Reason for sending it back (required)…',
    'review.noteLabel': 'Review note',
    'review.needNote': 'Write why you are sending it back.',
    'review.rejectedBy': 'Sent back by {name}',
    'review.verifiedBy': 'Verified by {name}',
    'review.ownWork': 'You cannot review your own work: your manager verifies it.',
    'review.checkEvidence': 'Check the evidence before deciding.',

    'incidents.empty': 'No open incidents. 🎉',
    'incidents.showAll': 'Showing all · tap to show open only',
    'incidents.showOpen': 'Showing open · tap to show all',
    'incidents.blocksRoom': 'blocks room',
    'incidents.report': 'Report',

    'newIncident.roomZone': 'Room / area',
    'newIncident.what': "What's wrong",
    'newIncident.whatPlaceholder': 'E.g.: sink faucet is leaking',
    'newIncident.detailsPlaceholder': 'Details (optional)',
    'newIncident.priority': 'Priority',
    'newIncident.blockTitle': 'Block room',
    'newIncident.blockHint': 'Cannot be sold until the issue is resolved',
    'newIncident.photo': 'Photo',
    'newIncident.camera': '📷 Camera',
    'newIncident.gallery': '🖼 Gallery',
    'newIncident.submit': 'Report incident',
    'newIncident.missingTitle': 'Missing information',
    'newIncident.missingBody': 'Select the room and describe the incident.',

    'profile.logout': 'Sign out',
    'profile.admin': 'Administration',
    'profile.lostItems': 'Lost & found',
    'profile.inventory': 'Inventory',
    'profile.users': 'Users',
    'profile.reports': 'Reports',

    'lost.title': 'Lost & found',
    'lost.new': 'Log item',
    'lost.description': 'Description',
    'lost.descriptionPlaceholder': 'E.g.: white phone charger',
    'lost.room': 'Room / area (optional)',
    'lost.claimant': 'Claimed by',
    'lost.claimantPlaceholder': "Guest's name",
    'lost.markClaimed': 'Mark claimed',
    'lost.markDelivered': 'Mark delivered',
    'lost.empty': 'No lost items logged.',
    'lost.foundBy': 'Found by',
    'lost.showAll': 'Showing all · tap to show open only',
    'lost.showOpen': 'Showing open · tap to show all',

    'inventory.title': 'Inventory',
    'inventory.new': 'New item',
    'inventory.name': 'Name',
    'inventory.category': 'Category',
    'inventory.unit': 'Unit',
    'inventory.minQty': 'Minimum',
    'inventory.qty': 'Current stock',
    'inventory.lowStock': 'Below minimum',
    'inventory.addStock': 'Restock',
    'inventory.useStock': 'Use',
    'inventory.reasonPlaceholder': 'Reason (optional)',
    'inventory.empty': 'No items in inventory.',

    'users.title': 'Users',
    'users.new': 'New user',
    'users.username': 'Username',
    'users.name': 'Name',
    'users.password': 'Password',
    'users.role': 'Role',
    'users.area': 'Area',
    'users.deactivate': 'Deactivate',
    'users.activate': 'Activate',
    'users.empty': 'No users.',
    'users.areaHint': 'Staff and area leads work inside one area. Heads and admins span all of them.',

    'reports.title': 'Reports',
    'reports.tasksSummary': 'Open tasks',
    'reports.roomsSummary': 'Rooms by status',
    'reports.incidentsOpen': 'Open incidents',
    'reports.exportTasks': 'Export tasks (CSV)',
    'reports.exportIncidents': 'Export incidents (CSV)',
    'reports.exportedTitle': 'Exported',
    'reports.exportedBody': 'The CSV file has been downloaded / shared.',

    'bulk.title': 'Bulk assign',
    'bulk.rooms': 'Rooms',
    'bulk.selectAll': 'Select all',
    'bulk.deselectAll': 'Deselect all',
    'bulk.selectedCount': '{n} rooms selected',
    'bulk.submit': 'Create {n} tasks',
    'bulk.missingTitle': 'Missing information',
    'bulk.missingBody': 'Select at least one room.',
  },
} as const satisfies Record<Lang, Record<string, string>>;

export type TKey = keyof (typeof dict)['es'];

interface I18nState {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: TKey, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nState | null>(null);

function translate(lang: Lang, key: TKey, vars?: Record<string, string | number>): string {
  let str: string = dict[lang][key] ?? dict.es[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) str = str.replace(`{${k}}`, String(v));
  }
  return str;
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>('es');

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((saved) => {
      if (saved === 'es' || saved === 'en') setLangState(saved);
    });
  }, []);

  const setLang = (l: Lang) => {
    setLangState(l);
    AsyncStorage.setItem(STORAGE_KEY, l);
  };

  const t = (key: TKey, vars?: Record<string, string | number>) => translate(lang, key, vars);

  return <I18nContext.Provider value={{ lang, setLang, t }}>{children}</I18nContext.Provider>;
}

export function useT(): I18nState {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useT debe usarse dentro de LanguageProvider');
  return ctx;
}

// Traduce un mapa de labels estático (roomStatus/taskStatus/priority/...) dado su prefijo.
export function useLabels(prefix: string, keys: string[]): Record<string, string> {
  const { t } = useT();
  return Object.fromEntries(keys.map((k) => [k, t(`${prefix}.${k}` as TKey)]));
}

// Metas traducidas (label + color) para los chips de estado/prioridad en toda la app.
export function useRoomStatusMeta(): Record<string, { label: string; color: string; soft: string }> {
  const { t } = useT();
  return Object.fromEntries(
    Object.entries(roomStatusColor).map(([k, v]) => [k, { ...v, label: t(`roomStatus.${k}` as TKey) }])
  );
}

export function useTaskStatusMeta(): Record<string, { label: string; color: string }> {
  const { t } = useT();
  return Object.fromEntries(
    Object.entries(taskStatusColor).map(([k, v]) => [k, { ...v, label: t(`taskStatus.${k}` as TKey) }])
  );
}

export function usePriorityMeta(): Record<string, { label: string; color: string }> {
  const { t } = useT();
  return Object.fromEntries(
    Object.entries(priorityColor).map(([k, v]) => [k, { ...v, label: t(`priority.${k}` as TKey) }])
  );
}

export function useIncidentStatusMeta(): Record<string, { label: string; color: string; soft: string }> {
  const { t } = useT();
  return Object.fromEntries(
    Object.entries(incidentStatusColor).map(([k, v]) => [k, { ...v, label: t(`incidentStatus.${k}` as TKey) }])
  );
}

export function useLostStatusMeta(): Record<string, { label: string; color: string; soft: string }> {
  const { t } = useT();
  return Object.fromEntries(
    Object.entries(lostStatusColor).map(([k, v]) => [k, { ...v, label: t(`lostStatus.${k}` as TKey) }])
  );
}

export function useTaskTypeLabels(): Record<string, string> {
  return useLabels('taskType', [
    'limpieza', 'mantenimiento', 'inspeccion', 'recepcion', 'cocina', 'lavanderia', 'general',
  ]);
}

export function useAreaLabels(): Record<string, string> {
  return useLabels('area', [
    'limpieza', 'mantenimiento', 'recepcion', 'cocina', 'lavanderia', 'administracion',
  ]);
}

export function useRoleLabels(): Record<string, string> {
  return useLabels('role', ['empleado', 'lider', 'jefe', 'admin']);
}

export function useRoomTypeLabels(): Record<string, string> {
  return useLabels('roomType', ['privada', 'suite', 'compartida', 'zona_comun']);
}
