# CgRM — Operaciones Casa Gracia

Aplicación móvil **100% propia** de operaciones hoteleras para Casa Gracia (Colombia): estado de habitaciones en tiempo real, tareas con checklist obligatoria, **evidencia fotográfica y de vídeo por punto de checklist**, revisión por parte del mando e incidencias de mantenimiento. Sin dependencia de ningún SaaS externo (inspirada funcionalmente en Breezeway / Control RM, pero independiente).

## Arquitectura

```
server/   API REST · Node + Express + Postgres (Neon) · JWT · permisos en src/permissions.js
app/      App móvil · Expo SDK 57 (React Native + expo-router) · iOS / Android / web
```

### Roles y áreas

Cada persona tiene un **rol** (jerárquico) y, si es empleado, un **área** (opcional):

| Rol | Alcance |
|---|---|
| `empleado` (con área) | Ejecuta el trabajo de **su área**. No verifica, no asigna, no ve otras áreas. |
| `empleado` (sin área, cuenta genérica) | Ve y ejecuta el trabajo de **todas** las áreas. Sigue sin poder verificar ni asignar. |
| `jefe` (dueño) | Crear, asignar, verificar y **devolver** trabajo en **todas las áreas**, más inventario, reportes y alta de personal. |
| `admin` | Acceso total, incluido crear jefes/admins. Es el rol del desarrollador. |

Áreas: `limpieza`, `mantenimiento`, `recepcion`, `cocina`, `lavanderia`, `administracion`.

Regla clave: **nadie firma su propio trabajo**. Si el líder ejecuta una tarea, la verifica su jefe.

### Sistema de evidencias

- Los puntos de checklist pueden exigir evidencia (`requires_evidence`, `evidence_kind`: foto/vídeo/cualquiera, `min_evidence`). **Un punto que la exige no se puede marcar sin adjuntarla** — lo bloquea la API, no solo la UI.
- La tarea no se puede cerrar si queda algún punto con la evidencia pendiente, y borrar una evidencia **desmarca** el punto que dependía de ella.
- El trabajo entregado (`hecha`) cae en la **bandeja de revisión** del líder, que lo verifica o lo **devuelve con un motivo obligatorio** (`rechazada` → vuelve a `en_curso`, y la habitación deja de estar lista).
- Qué puntos exigen evidencia se define en las plantillas de `server/src/db.js` (helper `ev(...)`).

### Estados

- **Habitación**: sucia → en limpieza → pendiente de inspección → lista · bloqueada. Se deriva del trabajo; una devolución la hace retroceder a *en limpieza*.
- **Tarea**: pendiente → en curso → hecha → verificada · **rechazada** · cancelada.
- **Incidencias**: cualquiera reporta (con foto y prioridad); cada una genera una orden de trabajo en su área; si es bloqueante, la habitación queda *bloqueada* y al resolverla vuelve a *sucia*.

## Almacenamiento de evidencias

Los ficheros **no pasan por la API**: el servidor firma una URL, la app sube el binario directo al object storage y luego registra la evidencia. Un vídeo son decenas de MB — meterlos en el JSON del API (como hacían las fotos de incidencias en base64) no escala.

En `server/.env`:

```bash
# Producción — Supabase Storage (bucket PRIVADO; las lecturas van firmadas y caducan en 1 h)
STORAGE_DRIVER=supabase
SUPABASE_URL=https://<proyecto>.supabase.co
SUPABASE_SERVICE_KEY=<service_role key>
SUPABASE_BUCKET=evidencias

# Desarrollo — sin credenciales: escribe en server/uploads/ y lo sirve este mismo servidor.
STORAGE_DRIVER=local
PUBLIC_URL=http://192.168.1.x:4000   # IP alcanzable desde el móvil, no localhost
```

Para preparar Supabase: crear el proyecto, crear un bucket llamado `evidencias` **sin marcar "Public bucket"**, y copiar la `service_role` key (Settings → API). El driver `local` es solo para desarrollo: los ficheros quedan accesibles sin firma.

Límites: 15 MB por foto, 120 MB por vídeo (`MAX_BYTES` en `server/src/storage.js`).

## Arrancar

```bash
# 1. API (puerto 4000). Requiere DATABASE_URL de Neon en server/.env
cd server && npm install
npm run migrate   # aplica db/schema.sql (idempotente)
npm run sync      # personal, habitaciones, checklists e inventario (NO destructivo)
npm start

# 2. App (Expo; en el móvil con Expo Go, mismo Wi-Fi: deriva la IP del bundler)
cd app && npm install && npx expo start
```

`npm run sync` es lo que se usa sobre una base con datos reales (upsert: no toca contraseñas existentes ni el stock). `npm run seed -- --reseed` **vacía la base entera** y solo debe usarse en desarrollo.

Solo existen 2 cuentas (cambiar en producción): `administradorcg/1234` (admin) y `empleado/empleado123` (empleado genérico, sin área fija: ve y trabaja **todas** las áreas — ver `seesAllAreas` en `server/src/permissions.js`).

En producción definir `CGRM_JWT_SECRET` y, si la API no corre junto al bundler, `EXPO_PUBLIC_API_URL` en la app.

## Manual de uso

La navegación principal se organiza en **pestañas**, con contador de notificaciones no leídas visible en todo momento.

### 🛏️ Habitaciones
Mapa de habitaciones por planta, filtrable por estado (sucia, en limpieza, pendiente de inspección, lista, ocupada, bloqueada). Desde aquí se hace el check-in/check-out de estancias y los cambios de estado permitidos por el flujo de la habitación. El detalle de una habitación (`room/[id]`) muestra su checklist y el historial de estancias.

### 📊 Dashboard
Anillos de progreso por tipo de trabajo (limpieza, mantenimiento, inspección). `jefe`/`admin` ven el agregado de todo el hotel; un `empleado` solo ve su propio trabajo pendiente.

### ✅ Tareas
Listado de tareas propias o del área, con estado, prioridad y progreso del checklist. El detalle (`task/[id]`) permite marcar puntos, adjuntar evidencia y, según el rol, aceptar, rechazar o verificar el trabajo.

- **Nueva tarea masiva**: una misma tarea repartida entre varias habitaciones/zonas a la vez, cada una con su checklist independiente.
- **Tareas programadas** (`jefe`/`admin`): recurrencia por frecuencia y día de la semana, con **auto-asignación** opcional — el sistema entrega cada tarea al empleado del área con **menos tareas abiertas** en ese momento, para balancear la carga sin intervención manual.

### 🚨 Incidencias
Listado con prioridad e indicación de si bloquean la habitación. Cualquiera puede reportar una incidencia nueva (con foto); genera automáticamente una orden de trabajo en el área correspondiente. El detalle (`incident/[id]`) permite ver evidencia, enviar mensajes ligados a la incidencia, cambiar su estado o derivarla a otra área.

### 🔍 Revisión
Bandeja de trabajo entregado (`hecha`) pendiente de aprobación, para `jefe`/líderes. Se aprueba o se **devuelve con motivo obligatorio** (vuelve a `en_curso`).

### 👤 Perfil
Fichar entrada/salida de turno (historial visible para `jefe`/`admin`), cambiar idioma y tema, cerrar sesión, y accesos según rol: objetos perdidos (todos), tareas programadas (supervisores), inventario/usuarios/reportes (`jefe`/`admin`).

### 📦 Inventario *(jefe/admin)*
Alta y edición de artículos de stock, y registro de movimientos (entradas y consumos) con control de concurrencia. **Aviso automático a jefes/admin** en el instante en que el stock cruza por debajo del mínimo configurado — no se repite en cada consumo posterior, solo al cruzar el umbral.

### 🧳 Objetos perdidos
Registro y seguimiento de objetos encontrados hasta ser reclamados. Cualquiera crea el registro; `jefe`/`admin` lo edita.

### 👥 Usuarios *(jefe/admin)*
Alta y edición de personal, con rol y área. Un `jefe` solo da de alta `empleado`s; solo un `admin` crea otros `jefe`s o `admin`s.

### 📈 Reportes *(jefe/admin)*
- **Tendencia de cierres**: tareas completadas por día (últimos 14 días).
- **Horas medias de cierre por área** (últimos 30 días).
- **Rendimiento por empleado**: tareas totales/completadas/rechazadas y tiempo medio de resolución (últimos 30 días).
- **Riesgo de incumplimiento (SLA)**: tareas aún no vencidas pero cuyo plazo cae en las próximas 6 horas, según su prioridad (urgente 4h, alta 24h, media 48h, baja 96h).
- Exportación a CSV.

### 🔔 Notificaciones
Centro de notificaciones (tareas nuevas, incidencias, stock bajo, riesgo de SLA...) con navegación directa al recurso relacionado.

### Comportamientos automáticos

- **Barrido de tareas vencidas**: antes de mostrar resumen o analítica, cualquier tarea que supere su plazo se marca sola como `vencida`.
- **Soporte sin conexión (solo lectura)**: si el dispositivo pierde red, la app muestra la última información cacheada con un aviso de "sin conexión"; las acciones que escriben datos requieren conexión y no quedan en cola para reintentar.
- **Cold-start del servidor**: tras hibernar (plan gratuito de Render), la primera petición puede tardar 30–50 s; la app hace una llamada de calentamiento al abrir y amplía el tiempo de espera para cubrir el caso.

## Estado de verificación

- **API**: prueba end-to-end (33 checks) del modelo de roles/áreas y del ciclo de evidencias — incluidos los casos que deben fallar: empleado creando tareas (403), líder cruzando de área (403), marcar un punto sin foto (400), cerrar con evidencias pendientes (400), verificarse a uno mismo (403), rechazar sin motivo (400).
- **App**: verificada en navegador (Expo web) con sesiones reales de empleada y de líder — checklist bloqueado por falta de foto, miniaturas firmadas, devolución con motivo y retroceso de la habitación. Typecheck y `expo export` limpios.
- Pendiente de probar en **dispositivo físico** (la captura de cámara/vídeo real solo se ha ejercitado vía API y en web).

## Hoja de ruta (no implementado aún)

- Integración con el PMS del hotel (reservas → tareas de salida automáticas).TV)
- Compresión/transcodificación de vídeo en el cliente antes de subir.
- Reproductor de vídeo embebido (hoy el vídeo se abre en el navegador del sistema).
- Logo real e iconos de marca (siguen los placeholders de la plantilla Expo).
