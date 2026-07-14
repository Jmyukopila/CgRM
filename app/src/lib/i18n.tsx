// Sistema de idioma (ES/EN) con persistencia en AsyncStorage.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useTheme } from './theme-context';

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
    'room.newTask': 'Nueva tarea',
    'room.createTask': 'Crear tarea',
    'room.tasksTitle': 'Tareas',
    'room.incidentsTitle': 'Incidencias',
    'room.emptyTasks': 'Sin tareas en esta habitación.',
    'room.emptyIncidents': 'Sin incidencias en esta habitación.',
    'room.open': 'Abierta',
    'room.resolved': 'Resuelta',
    'room.taskName': 'Nombre de la tarea',
    'room.taskNamePlaceholder': 'Ej.: repasar cristales (opcional)',
    'room.taskDescriptionPlaceholder': 'Descripción (opcional)',
    'room.schedule': 'Programación',
    'room.scheduleOnce': 'Única',
    'room.scheduleRecurrent': 'Recurrente',
    'room.scheduleDate': 'Programada',
    'room.scheduleFrom': 'Fecha',
    'room.scheduleTo': 'Fecha fin (periodo, opcional)',
    'room.datePlaceholder': 'AAAA-MM-DD',
    'room.dateInvalid': 'Fecha no válida (formato AAAA-MM-DD)',
    'room.scheduleCreated': 'Programación creada',

    // Tareas (lista)
    'tasks.empty': 'Sin tareas por ahora.',
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

    // Asignación masiva
    'bulk.title': 'Asignación masiva',
    'bulk.rooms': 'Habitaciones',
    'bulk.selectAll': 'Seleccionar todas',
    'bulk.deselectAll': 'Quitar selección',
    'bulk.selectedCount': '{n} habitaciones seleccionadas',
    'bulk.submit': 'Crear {n} tareas',
    'bulk.missingTitle': 'Faltan datos',
    'bulk.missingBody': 'Selecciona al menos una habitación.',
    'bulk.configure': 'Configurar tarea',
    'bulk.summary': 'Resumen',
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

    'room.newTask': 'New task',
    'room.createTask': 'Create task',
    'room.tasksTitle': 'Tasks',
    'room.incidentsTitle': 'Incidents',
    'room.emptyTasks': 'No tasks for this room.',
    'room.emptyIncidents': 'No incidents for this room.',
    'room.open': 'Open',
    'room.resolved': 'Resolved',
    'room.taskName': 'Task name',
    'room.taskNamePlaceholder': 'E.g.: wipe down windows (optional)',
    'room.taskDescriptionPlaceholder': 'Description (optional)',
    'room.schedule': 'Schedule',
    'room.scheduleOnce': 'One-time',
    'room.scheduleRecurrent': 'Recurring',
    'room.scheduleDate': 'Scheduled',
    'room.scheduleFrom': 'Date',
    'room.scheduleTo': 'End date (period, optional)',
    'room.datePlaceholder': 'YYYY-MM-DD',
    'room.dateInvalid': 'Invalid date (use YYYY-MM-DD)',
    'room.scheduleCreated': 'Schedule created',

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

    'reports.title': 'Reports',
    'reports.tasksSummary': 'Open tasks',
    'reports.roomsSummary': 'Rooms by status',
    'reports.incidentsOpen': 'Open incidents',
    'reports.pendingReview': 'Pending review',
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
    'bulk.configure': 'Configure task',
    'bulk.summary': 'Summary',
    'bulk.recurrent': 'Recurring task',
    'bulk.oneTime': 'One-time',
    'bulk.frequency': 'Frequency',
    'bulk.hours': 'Run times',
    'bulk.freq.diaria': 'Daily',
    'bulk.freq.semanal': 'Weekly',
    'bulk.freq.mensual': 'Monthly',
    'bulk.freq.una_vez': 'One-time',

    'schedules.title': 'Scheduled',
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

export function usePriorityMeta(): Record<string, { label: string; color: string }> {
  const { t } = useT();
  const { statusMaps } = useTheme();
  return Object.fromEntries(
    Object.entries(statusMaps.priorityColor).map(([k, v]) => [k, { ...v, label: t(`priority.${k}` as TKey) }])
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
