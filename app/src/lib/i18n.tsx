// Sistema de idioma (ES/EN) con persistencia en AsyncStorage.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Ionicons } from '@expo/vector-icons';
import { useTheme } from './theme-context';
import { PRIORITY_ICON, TASK_TYPE_ICON, taskTypeColor } from './theme';

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
    'common.retry': 'Reintentar',
    'common.connectionError': 'No se pudo conectar con el servidor.',
    'common.offlineBanner': 'Sin conexión · mostrando lo último guardado',
    'common.unassigned': 'Sin asignar',
    'common.send': 'Enviar',
    'common.server': 'Servidor',
    'common.language': 'Idioma',
    'common.all': 'Todas',
    'common.optional': 'opcional',

    // Roles
    'role.empleado': 'Empleado',
    'role.jefe': 'Jefe / dueño',
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
    'roomStatus.ocupada': 'Ocupada',
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
    'taskStatus.vencida': 'Vencida',
    'taskStatus.impugnada': 'Impugnada',

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
    'tabs.dashboard': 'Panel',
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
    'login.noAccount': '¿No tienes cuenta? Crear cuenta',

    // Autorregistro (siempre crea un empleado)
    'register.title': 'Crear cuenta',
    'register.subtitle': 'Para el equipo · limpieza · mantenimiento',
    'register.name': 'Nombre completo',
    'register.username': 'Usuario',
    'register.password': 'Contraseña',
    'register.passwordHint': 'Mínimo 6 caracteres',
    'register.area': 'Tu área de trabajo',
    'register.submit': 'Crear cuenta',
    'register.haveAccount': '¿Ya tienes cuenta? Entrar',
    'register.error': 'No se pudo crear la cuenta',

    // Panel de habitaciones
    'rooms.empty': 'No hay habitaciones en este estado.',

    // Detalle de habitación
    'room.newTask': 'Nueva tarea',
    'room.createTask': 'Crear tarea',
    'room.tasksTitle': 'Tareas',
    'room.incidentsTitle': 'Incidencias',
    'room.emptyTasks': 'Sin tareas en esta habitación.',
    'room.emptyIncidents': 'Sin incidencias en esta habitación.',
    'room.open': 'Abierta',
    'room.resolved': 'Resuelta',
    'room.taskType': 'Tipo de trabajo',
    'room.taskPriority': 'Prioridad',
    'room.taskName': 'Nombre de la tarea',
    'room.taskNamePlaceholder': 'Ej.: repasar cristales (opcional)',
    'room.taskDescriptionPlaceholder': 'Descripción (opcional)',
    'room.checklistTitle': 'Checklist de este sitio',
    'room.checklistHint':
      'Lo que se copia a cada tarea nueva de este tipo aquí. Cambiarla no toca las tareas ya repartidas.',
    'room.checklistEmpty': 'Sin puntos para este tipo de trabajo.',
    'room.checklistEdit': 'Editar',
    'room.checklistSaved': 'Checklist guardada',
    'room.checklistCopy': 'Copiar a...',
    'room.checklistCopyTitle': 'Copiar checklist a otras habitaciones',
    'room.checklistCopySubmit': 'Copiar a {n} habitaciones',
    'room.checklistCopied': 'Checklist copiada',
    'room.taskChecklist': 'Checklist',
    'room.schedule': 'Programación',
    'room.scheduleOnce': 'Única',
    'room.scheduleRecurrent': 'Recurrente',
    'room.scheduleDate': 'Programada',
    'room.scheduleFrom': 'Fecha',
    'room.scheduleTo': 'Fecha fin (periodo, opcional)',
    'room.datePlaceholder': 'AAAA-MM-DD',
    'room.dateInvalid': 'Fecha no válida (formato AAAA-MM-DD)',
    'room.scheduleCreated': 'Programación creada',

    // Acciones rápidas de estado (tablero de housekeeping)
    'roomAction.title': 'Cambiar estado',
    'roomAction.to': 'Pasar a {status}',
    'roomAction.checkout': 'Registrar salida',
    'roomAction.notAllowed': 'No puedes hacer ese cambio de estado',
    'roomAction.openRoom': 'Ver ficha / estancia',

    // Estancias
    'stay.title': 'Estancia',
    'stay.expectedCheckout': 'Salida prevista',
    'stay.notes': 'Notas',
    'stay.checkoutDone': 'Salida registrada',
    'stay.checkoutConfirmTitle': 'Registrar salida',
    'stay.checkoutConfirmBody': 'Se generará la limpieza de salida y la habitación pasará a sucia.',
    'stay.noActive': 'Habitación libre',
    'stay.history': 'Historial de estancias',
    'stay.checkedInBy': 'Entrada por {name}',
    'stay.checkedOutBy': 'Salida por {name}',

    // Historial (auditoría)
    'history.title': 'Historial',
    'history.empty': 'Sin movimientos todavía.',
    'history.action.created': 'Creada',
    'history.action.status': '{from} → {to}',
    'history.action.assignee': 'Reasignada: {from} → {to}',
    'history.action.checkin': 'Entrada de {to}',
    'history.action.checkout': 'Salida de {from}',
    'history.bySystem': 'Sistema',

    // Centro de notificaciones
    'notif.title': 'Notificaciones',
    'notif.empty': 'Sin notificaciones.',
    'notif.markAllRead': 'Marcar todas como leídas',

    // Días de la semana (recurrencia)
    'weekday.0': 'D',
    'weekday.1': 'L',
    'weekday.2': 'M',
    'weekday.3': 'X',
    'weekday.4': 'J',
    'weekday.5': 'V',
    'weekday.6': 'S',

    // Tareas (lista)
    'tasks.empty': 'Sin tareas por ahora.',
    'tasks.showAll': 'Mostrando todas · tocar para ver solo abiertas',
    'tasks.showOpen': 'Mostrando abiertas · tocar para ver todas',
    'tasks.breakdown': 'puntos',
    'tasks.incidentTag': '(avería)',
    'tasks.bulkNew': 'Asignación masiva',

    // Editor de checklist
    'checklist.addPoint': 'Añadir punto',
    'checklist.pointPlaceholder': 'Qué hay que hacer o comprobar',
    'checklist.noEvidence': 'Sin prueba',
    'checklist.photo': 'Foto',
    'checklist.video': 'Vídeo',
    'checklist.anyEvidence': 'Foto o vídeo',

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
    'task.doneByNamePlaceholder': 'Nombre de quien completó la tarea',
    'task.doneByNameRequired': 'Escribe el nombre de quien completó la tarea',
    'task.completedBy': 'Completado por {name}',
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
    'review.empty': 'Nada pendiente de revisar.',
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
    'review.dispute': 'Impugnar verificación',
    'review.disputePlaceholder': 'Motivo de la impugnación (obligatorio)…',
    'review.needDisputeNote': 'Escribe el motivo de la impugnación.',
    'review.disputedBy': 'Impugnada por {name}',
    'task.overdue': 'Plazo vencido — retómala o cancélala.',
    'time.minutesAgo': 'hace {n} min',
    'time.hoursAgo': 'hace {n} h',
    'time.daysAgo': 'hace {n} d',

    // Incidencias
    'incidents.empty': 'Ninguna incidencia abierta.',
    'incidents.showAll': 'Mostrando todas · tocar para ver solo abiertas',
    'incidents.showOpen': 'Mostrando abiertas · tocar para ver todas',
    'incidents.blocksRoom': 'bloquea habitación',
    'incidents.report': 'Reportar',

    // Detalle de incidencia
    'incident.description': 'Descripción',
    'incident.room': 'Habitación',
    'incident.linkedTask': 'Ver tarea vinculada',
    'incident.changeStatus': 'Cambiar estado',
    'incident.noPhoto': 'Sin foto adjunta.',

    // Nueva incidencia
    'newIncident.title': 'Nueva incidencia',
    'newIncident.roomZone': 'Habitación / zona',
    'newIncident.what': 'Qué pasa',
    'newIncident.whatPlaceholder': 'Ej.: gotea el grifo del lavabo',
    'newIncident.detailsPlaceholder': 'Detalles (opcional)',
    'newIncident.priority': 'Prioridad',
    'newIncident.blockTitle': 'Bloquear habitación',
    'newIncident.blockHint': 'No se puede vender hasta resolver la avería',
    'newIncident.photo': 'Foto',
    'newIncident.camera': 'Cámara',
    'newIncident.gallery': 'Galería',
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
    'profile.startShift': 'Iniciar turno',
    'profile.startShiftConfirmTitle': '¿Iniciar turno?',
    'profile.startShiftConfirmBody': 'Se guardará la hora de tu llegada.',
    'profile.startShiftDone': 'Turno iniciado',
    'profile.startShiftDoneBody': 'Entrada registrada a las {time}.',
    'profile.endShift': 'Finalizar turno',
    'profile.endShiftConfirmTitle': '¿Finalizar turno?',
    'profile.endShiftConfirmBody': 'Se guardará la hora de salida y se avisará a tu líder.',
    'profile.endShiftDone': 'Turno finalizado',
    'profile.endShiftDoneBody': 'Salida registrada a las {time}.',

    // Apariencia
    'settings.appearance': 'Apariencia',
    'settings.light': 'Claro',
    'settings.dark': 'Oscuro',
    'settings.system': 'Sistema',

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
    'users.showAll': 'Mostrando todos · tocar para ver solo activos',
    'users.showActive': 'Mostrando activos · tocar para ver todos',
    'users.inactive': 'Desactivado',

    // Panel de control
    'dashboard.title': 'Panel de control',
    'dashboard.subtitleTeam': 'Todas las áreas · hoy',
    'dashboard.subtitleMine': 'Tu trabajo · hoy',
    'dashboard.done': 'Terminado',
    'dashboard.inProgress': 'En progreso',
    'dashboard.notStarted': 'No iniciado',
    'dashboard.roomsTitle': 'Habitaciones',
    'dashboard.myTasksTitle': 'Tus tareas',
    'dashboard.lowStock': 'artículos con stock bajo',
    'dashboard.emptyRooms': 'No hay habitaciones que mostrar.',
    'dashboard.emptyTasks': 'No tienes tareas asignadas ahora mismo.',
    'dashboard.guest': 'Huésped',
    'dashboard.free': 'Libre',

    // Reportes
    'reports.title': 'Reportes',
    'reports.tasksSummary': 'Tareas abiertas',
    'reports.roomsSummary': 'Habitaciones por estado',
    'reports.incidentsOpen': 'Incidencias abiertas',
    'reports.pendingReview': 'Por revisar',
    'reports.exportTasks': 'Exportar tareas (CSV)',
    'reports.exportIncidents': 'Exportar incidencias (CSV)',
    'reports.exportedTitle': 'Exportado',
    'reports.exportedBody': 'El archivo CSV se ha descargado / compartido.',
    'reports.atRisk': 'A punto de vencer (6 h)',
    'reports.atRiskEmpty': 'Nada a punto de vencer.',
    'reports.avgClose': 'Tiempo medio de cierre (30 días)',
    'reports.avgCloseEmpty': 'Sin cierres en los últimos 30 días.',
    'reports.staffPerf': 'Rendimiento del equipo (30 días)',
    'reports.staffPerfEmpty': 'Sin trabajo asignado en los últimos 30 días.',
    'reports.trend': 'Tareas cerradas (14 días)',
    'reports.trendEmpty': 'Sin cierres en los últimos 14 días.',
    'reports.hours': 'h',
    'reports.rejected': 'devueltas',

    // Asignación masiva
    'bulk.title': 'Asignación masiva',
    'bulk.selectAll': 'Seleccionar todas',
    'bulk.deselectAll': 'Quitar selección',
    'bulk.selectedCount': '{n} seleccionados',
    'bulk.submit': 'Crear {n} tareas',
    'bulk.missingTitle': 'Faltan datos',
    'bulk.missingBody': 'Selecciona al menos un sitio donde hacer la tarea.',
    'bulk.missingName': 'Ponle un título a la tarea (ej.: «Limpieza general»).',
    'bulk.configure': 'Configurar tarea',
    'bulk.summary': 'Resumen',
    'bulk.where': 'Dónde se hace',
    'bulk.what': 'Qué hay que hacer',
    'bulk.type': 'Tipo de tarea',
    'bulk.priority': 'Prioridad',
    'bulk.who': 'Quién lo hace',
    'bulk.autoAssign': 'Auto-asignar (equilibrado)',
    'bulk.rooms': 'Habitaciones',
    'bulk.zones': 'Zonas comunes',
    'bulk.allRooms': 'Todas las habitaciones',
    'bulk.allZones': 'Todas las zonas',
    'bulk.clear': 'Ninguno',
    'bulk.titlePlaceholder': 'Título: ej. «Limpieza general»',
    'bulk.descPlaceholder': 'Detalles para el equipo (opcional)',
    'bulk.checklist': 'Checklist',
    'bulk.checklistHint': 'Se parte de la checklist del primer sitio seleccionado. Editarla aquí la deja como la checklist individual de cada sitio elegido.',
    'bulk.recurrent': 'Tarea recurrente',
    'bulk.oneTime': 'Una sola vez',
    'bulk.frequency': 'Frecuencia',
    'bulk.hours': 'Horas de ejecución',
    'bulk.freq.diaria': 'Diaria',
    'bulk.freq.semanal': 'Semanal',
    'bulk.freq.mensual': 'Mensual',
    'bulk.freq.una_vez': 'Una vez',

    // Programaciones (líder+)
    'schedules.title': 'Programadas',
    'schedules.autoAssign': 'Auto-asignado (equilibrado)',
    'schedules.empty': 'No hay tareas programadas.',
    'schedules.cancel': 'Cancelar',
    'schedules.cancelConfirmTitle': 'Cancelar programación',
    'schedules.cancelConfirmBody': 'No se generarán más tareas a partir de esta programación.',
    'schedules.hours': 'a las {hours}',
    'schedules.until': 'hasta {date}',
  },
  en: {
    'common.cancel': 'Cancel',
    'common.save': 'Save',
    'common.create': 'Create',
    'common.close': 'Close',
    'common.error': 'Error',
    'common.retry': 'Retry',
    'common.connectionError': 'Could not connect to the server.',
    'common.offlineBanner': 'Offline · showing the last saved data',
    'common.unassigned': 'Unassigned',
    'common.send': 'Send',
    'common.server': 'Server',
    'common.language': 'Language',
    'common.all': 'All',
    'common.optional': 'optional',

    'role.empleado': 'Staff',
    'role.jefe': 'Owner / manager',
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
    'roomStatus.ocupada': 'Occupied',
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
    'taskStatus.vencida': 'Overdue',
    'taskStatus.impugnada': 'Disputed',

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
    'tabs.dashboard': 'Dashboard',
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
    'login.noAccount': "Don't have an account? Sign up",

    'register.title': 'Create account',
    'register.subtitle': 'For the team · housekeeping · maintenance',
    'register.name': 'Full name',
    'register.username': 'Username',
    'register.password': 'Password',
    'register.passwordHint': 'At least 6 characters',
    'register.area': 'Your work area',
    'register.submit': 'Create account',
    'register.haveAccount': 'Already have an account? Sign in',
    'register.error': 'Could not create the account',

    'rooms.empty': 'No rooms in this state.',

    'room.newTask': 'New task',
    'room.createTask': 'Create task',
    'room.tasksTitle': 'Tasks',
    'room.incidentsTitle': 'Incidents',
    'room.emptyTasks': 'No tasks for this room.',
    'room.emptyIncidents': 'No incidents for this room.',
    'room.open': 'Open',
    'room.resolved': 'Resolved',
    'room.taskType': 'Type of work',
    'room.taskPriority': 'Priority',
    'room.taskName': 'Task name',
    'room.taskNamePlaceholder': 'E.g.: wipe down windows (optional)',
    'room.taskDescriptionPlaceholder': 'Description (optional)',
    'room.checklistTitle': "This place's checklist",
    'room.checklistHint':
      'Copied into every new task of this type here. Editing it never touches tasks already handed out.',
    'room.checklistEmpty': 'No points for this kind of work.',
    'room.checklistEdit': 'Edit',
    'room.checklistSaved': 'Checklist saved',
    'room.checklistCopy': 'Copy to...',
    'room.checklistCopyTitle': 'Copy checklist to other rooms',
    'room.checklistCopySubmit': 'Copy to {n} rooms',
    'room.checklistCopied': 'Checklist copied',
    'room.taskChecklist': 'Checklist',
    'room.schedule': 'Schedule',
    'room.scheduleOnce': 'One-time',
    'room.scheduleRecurrent': 'Recurring',
    'room.scheduleDate': 'Scheduled',
    'room.scheduleFrom': 'Date',
    'room.scheduleTo': 'End date (period, optional)',
    'room.datePlaceholder': 'YYYY-MM-DD',
    'room.dateInvalid': 'Invalid date (use YYYY-MM-DD)',
    'room.scheduleCreated': 'Schedule created',

    'roomAction.title': 'Change status',
    'roomAction.to': 'Move to {status}',
    'roomAction.checkout': 'Check out',
    'roomAction.notAllowed': "You can't make that status change",
    'roomAction.openRoom': 'View room / stay',

    'stay.title': 'Stay',
    'stay.expectedCheckout': 'Expected checkout',
    'stay.notes': 'Notes',
    'stay.checkoutDone': 'Check-out recorded',
    'stay.checkoutConfirmTitle': 'Check out',
    'stay.checkoutConfirmBody': 'This will create the checkout cleaning task and set the room to dirty.',
    'stay.noActive': 'Room is free',
    'stay.history': 'Stay history',
    'stay.checkedInBy': 'Checked in by {name}',
    'stay.checkedOutBy': 'Checked out by {name}',

    'history.title': 'History',
    'history.empty': 'No activity yet.',
    'history.action.created': 'Created',
    'history.action.status': '{from} → {to}',
    'history.action.assignee': 'Reassigned: {from} → {to}',
    'history.action.checkin': 'Checked in {to}',
    'history.action.checkout': 'Checked out {from}',
    'history.bySystem': 'System',

    'notif.title': 'Notifications',
    'notif.empty': 'No notifications.',
    'notif.markAllRead': 'Mark all as read',

    'weekday.0': 'S',
    'weekday.1': 'M',
    'weekday.2': 'T',
    'weekday.3': 'W',
    'weekday.4': 'T',
    'weekday.5': 'F',
    'weekday.6': 'S',

    'checklist.addPoint': 'Add point',
    'checklist.pointPlaceholder': 'What must be done or checked',
    'checklist.noEvidence': 'No proof',
    'checklist.photo': 'Photo',
    'checklist.video': 'Video',
    'checklist.anyEvidence': 'Photo or video',

    'tasks.empty': 'No tasks right now.',
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
    'task.doneByNamePlaceholder': "Name of who completed the task",
    'task.doneByNameRequired': 'Write the name of who completed the task',
    'task.completedBy': 'Completed by {name}',
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
    'review.empty': 'Nothing left to review.',
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
    'review.dispute': 'Dispute verification',
    'review.disputePlaceholder': 'Reason for the dispute (required)…',
    'review.needDisputeNote': 'Write why you are disputing it.',
    'review.disputedBy': 'Disputed by {name}',
    'task.overdue': 'Deadline passed — resume it or cancel it.',
    'time.minutesAgo': '{n} min ago',
    'time.hoursAgo': '{n} h ago',
    'time.daysAgo': '{n} d ago',

    'incidents.empty': 'No open incidents.',
    'incidents.showAll': 'Showing all · tap to show open only',
    'incidents.showOpen': 'Showing open · tap to show all',
    'incidents.blocksRoom': 'blocks room',
    'incidents.report': 'Report',

    'incident.description': 'Description',
    'incident.room': 'Room',
    'incident.linkedTask': 'View linked task',
    'incident.changeStatus': 'Change status',
    'incident.noPhoto': 'No photo attached.',

    'newIncident.title': 'New incident',
    'newIncident.roomZone': 'Room / area',
    'newIncident.what': "What's wrong",
    'newIncident.whatPlaceholder': 'E.g.: sink faucet is leaking',
    'newIncident.detailsPlaceholder': 'Details (optional)',
    'newIncident.priority': 'Priority',
    'newIncident.blockTitle': 'Block room',
    'newIncident.blockHint': 'Cannot be sold until the issue is resolved',
    'newIncident.photo': 'Photo',
    'newIncident.camera': 'Camera',
    'newIncident.gallery': 'Gallery',
    'newIncident.submit': 'Report incident',
    'newIncident.missingTitle': 'Missing information',
    'newIncident.missingBody': 'Select the room and describe the incident.',

    'profile.logout': 'Sign out',
    'profile.admin': 'Administration',
    'profile.lostItems': 'Lost & found',
    'profile.inventory': 'Inventory',
    'profile.users': 'Users',
    'profile.reports': 'Reports',
    'profile.startShift': 'Start shift',
    'profile.startShiftConfirmTitle': 'Start your shift?',
    'profile.startShiftConfirmBody': 'Your arrival time will be saved.',
    'profile.startShiftDone': 'Shift started',
    'profile.startShiftDoneBody': 'Check-in logged at {time}.',
    'profile.endShift': 'End shift',
    'profile.endShiftConfirmTitle': 'End your shift?',
    'profile.endShiftConfirmBody': 'Your exit time will be saved and your lead will be notified.',
    'profile.endShiftDone': 'Shift ended',
    'profile.endShiftDoneBody': 'Exit logged at {time}.',

    // Appearance
    'settings.appearance': 'Appearance',
    'settings.light': 'Light',
    'settings.dark': 'Dark',
    'settings.system': 'System',

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
    'users.showAll': 'Showing all · tap to show active only',
    'users.showActive': 'Showing active · tap to show all',
    'users.inactive': 'Deactivated',

    // Dashboard
    'dashboard.title': 'Control panel',
    'dashboard.subtitleTeam': 'All areas · today',
    'dashboard.subtitleMine': 'Your work · today',
    'dashboard.done': 'Done',
    'dashboard.inProgress': 'In progress',
    'dashboard.notStarted': 'Not started',
    'dashboard.roomsTitle': 'Rooms',
    'dashboard.myTasksTitle': 'Your tasks',
    'dashboard.lowStock': 'items low on stock',
    'dashboard.emptyRooms': 'No rooms to show.',
    'dashboard.emptyTasks': "You don't have any tasks assigned right now.",
    'dashboard.guest': 'Guest',
    'dashboard.free': 'Free',

    'reports.title': 'Reports',
    'reports.tasksSummary': 'Open tasks',
    'reports.roomsSummary': 'Rooms by status',
    'reports.incidentsOpen': 'Open incidents',
    'reports.pendingReview': 'Pending review',
    'reports.exportTasks': 'Export tasks (CSV)',
    'reports.exportIncidents': 'Export incidents (CSV)',
    'reports.exportedTitle': 'Exported',
    'reports.exportedBody': 'The CSV file has been downloaded / shared.',
    'reports.atRisk': 'At risk of missing deadline (6h)',
    'reports.atRiskEmpty': 'Nothing at risk right now.',
    'reports.avgClose': 'Avg. close time (30 days)',
    'reports.avgCloseEmpty': 'No closed tasks in the last 30 days.',
    'reports.staffPerf': 'Team performance (30 days)',
    'reports.staffPerfEmpty': 'No work assigned in the last 30 days.',
    'reports.trend': 'Closed tasks (14 days)',
    'reports.trendEmpty': 'No closures in the last 14 days.',
    'reports.hours': 'h',
    'reports.rejected': 'returned',

    'bulk.title': 'Bulk assign',
    'bulk.selectAll': 'Select all',
    'bulk.deselectAll': 'Deselect all',
    'bulk.selectedCount': '{n} selected',
    'bulk.submit': 'Create {n} tasks',
    'bulk.missingTitle': 'Missing information',
    'bulk.missingBody': 'Pick at least one place to do the task.',
    'bulk.missingName': 'Give the task a title (e.g. “Deep clean”).',
    'bulk.configure': 'Configure task',
    'bulk.summary': 'Summary',
    'bulk.where': 'Where',
    'bulk.what': 'What to do',
    'bulk.type': 'Task type',
    'bulk.priority': 'Priority',
    'bulk.who': 'Who does it',
    'bulk.autoAssign': 'Auto-assign (balanced)',
    'bulk.rooms': 'Rooms',
    'bulk.zones': 'Common areas',
    'bulk.allRooms': 'All rooms',
    'bulk.allZones': 'All areas',
    'bulk.clear': 'None',
    'bulk.titlePlaceholder': 'Title: e.g. “Deep clean”',
    'bulk.descPlaceholder': 'Details for the team (optional)',
    'bulk.checklist': 'Checklist',
    'bulk.checklistHint': "Starts from the first selected place's checklist. Editing it here leaves it as the individual checklist of every place picked.",
    'bulk.recurrent': 'Recurring task',
    'bulk.oneTime': 'One-time',
    'bulk.frequency': 'Frequency',
    'bulk.hours': 'Run times',
    'bulk.freq.diaria': 'Daily',
    'bulk.freq.semanal': 'Weekly',
    'bulk.freq.mensual': 'Monthly',
    'bulk.freq.una_vez': 'One-time',

    'schedules.title': 'Scheduled',
    'schedules.autoAssign': 'Auto-assigned (balanced)',
    'schedules.empty': 'No scheduled tasks.',
    'schedules.cancel': 'Cancel',
    'schedules.cancelConfirmTitle': 'Cancel schedule',
    'schedules.cancelConfirmBody': 'No more tasks will be generated from this schedule.',
    'schedules.hours': 'at {hours}',
    'schedules.until': 'until {date}',
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
// Los mapas de color vienen del tema activo (useTheme().statusMaps): cambian
// solos con el modo claro/oscuro sin que cada pantalla toque nada.
export function useRoomStatusMeta(): Record<string, { label: string; color: string; soft: string }> {
  const { t } = useT();
  const { statusMaps } = useTheme();
  return Object.fromEntries(
    Object.entries(statusMaps.roomStatusColor).map(([k, v]) => [k, { ...v, label: t(`roomStatus.${k}` as TKey) }])
  );
}

export function useTaskStatusMeta(): Record<string, { label: string; color: string }> {
  const { t } = useT();
  const { statusMaps } = useTheme();
  return Object.fromEntries(
    Object.entries(statusMaps.taskStatusColor).map(([k, v]) => [k, { ...v, label: t(`taskStatus.${k}` as TKey) }])
  );
}

export function usePriorityMeta(): Record<string, { label: string; color: string; icon: keyof typeof Ionicons.glyphMap }> {
  const { t } = useT();
  const { statusMaps } = useTheme();
  return Object.fromEntries(
    Object.entries(statusMaps.priorityColor).map(([k, v]) => [
      k,
      { ...v, label: t(`priority.${k}` as TKey), icon: PRIORITY_ICON[k] ?? 'ellipse-outline' },
    ])
  );
}

export function useIncidentStatusMeta(): Record<string, { label: string; color: string; soft: string }> {
  const { t } = useT();
  const { statusMaps } = useTheme();
  return Object.fromEntries(
    Object.entries(statusMaps.incidentStatusColor).map(([k, v]) => [k, { ...v, label: t(`incidentStatus.${k}` as TKey) }])
  );
}

export function useLostStatusMeta(): Record<string, { label: string; color: string; soft: string }> {
  const { t } = useT();
  const { statusMaps } = useTheme();
  return Object.fromEntries(
    Object.entries(statusMaps.lostStatusColor).map(([k, v]) => [k, { ...v, label: t(`lostStatus.${k}` as TKey) }])
  );
}

export function useTaskTypeLabels(): Record<string, string> {
  return useLabels('taskType', [
    'limpieza', 'mantenimiento', 'inspeccion', 'recepcion', 'cocina', 'lavanderia', 'general',
  ]);
}

// Meta (label + color + icono) del selector de tipo/área en la creación de tareas.
export function useTaskTypeMeta(): Record<string, { label: string; color: string; icon: keyof typeof Ionicons.glyphMap }> {
  const labels = useTaskTypeLabels();
  const { colors } = useTheme();
  return Object.fromEntries(
    Object.entries(labels).map(([k, label]) => [
      k,
      { label, color: taskTypeColor(colors, k), icon: TASK_TYPE_ICON[k] ?? 'apps-outline' },
    ])
  );
}

export function useAreaLabels(): Record<string, string> {
  return useLabels('area', [
    'limpieza', 'mantenimiento', 'recepcion', 'cocina', 'lavanderia', 'administracion',
  ]);
}

export function useRoleLabels(): Record<string, string> {
  return useLabels('role', ['empleado', 'jefe', 'admin']);
}

export function useRoomTypeLabels(): Record<string, string> {
  return useLabels('roomType', ['privada', 'suite', 'compartida', 'zona_comun']);
}

// "hace 5 min" / "hace 2 h" / "hace 3 d", reutilizado en historial, revisión y notificaciones.
export function useRelativeTime() {
  const { t } = useT();
  return (iso: string | null) => {
    if (!iso) return '';
    const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
    if (mins < 60) return t('time.minutesAgo', { n: mins });
    const hours = Math.round(mins / 60);
    if (hours < 24) return t('time.hoursAgo', { n: hours });
    return t('time.daysAgo', { n: Math.round(hours / 24) });
  };
}
