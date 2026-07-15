# CgRM — Operaciones Casa Gracia

Aplicación móvil **100% propia** de operaciones hoteleras para Casa Gracia (Colombia): estado de habitaciones en tiempo real, tareas con checklist obligatoria, **evidencia fotográfica y de vídeo por punto de checklist**, revisión por parte del mando e incidencias de mantenimiento. Sin dependencia de ningún SaaS externo (inspirada funcionalmente en Breezeway / Control RM, pero independiente).

## Arquitectura

```
server/   API REST · Node + Express + Postgres (Neon) · JWT · permisos en src/permissions.js
app/      App móvil · Expo SDK 57 (React Native + expo-router) · iOS / Android / web
```

### Roles y áreas

Cada persona tiene un **rol** (jerárquico) y, si es empleado, un **área**:

| Rol | Alcance |
|---|---|
| `empleado` | Ejecuta el trabajo de **su área**. No verifica, no asigna, no ve otras áreas. |
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

Usuarios de demostración (cambiar en producción): `admin/1234` (admin), `jefe/gracia123`, `gobernanta/gracia123` (líder limpieza), `maria` y `lucia` (limpieza), `jordi` (líder mantenimiento), `pedro` (mantenimiento), `sofia` (líder recepción), `daniel` (recepción), `marta` (líder cocina), `rosa` (lavandería) — el resto con `gracia123`.

En producción definir `CGRM_JWT_SECRET` y, si la API no corre junto al bundler, `EXPO_PUBLIC_API_URL` en la app.

## Estado de verificación

- **API**: prueba end-to-end (33 checks) del modelo de roles/áreas y del ciclo de evidencias — incluidos los casos que deben fallar: empleado creando tareas (403), líder cruzando de área (403), marcar un punto sin foto (400), cerrar con evidencias pendientes (400), verificarse a uno mismo (403), rechazar sin motivo (400).
- **App**: verificada en navegador (Expo web) con sesiones reales de empleada y de líder — checklist bloqueado por falta de foto, miniaturas firmadas, devolución con motivo y retroceso de la habitación. Typecheck y `expo export` limpios.
- Pendiente de probar en **dispositivo físico** (la captura de cámara/vídeo real solo se ha ejercitado vía API y en web).

## Hoja de ruta (no implementado aún)

- Integración con el PMS del hotel (reservas → tareas de salida automáticas).
- Compresión/transcodificación de vídeo en el cliente antes de subir.
- Reproductor de vídeo embebido (hoy el vídeo se abre en el navegador del sistema).
- Logo real e iconos de marca (siguen los placeholders de la plantilla Expo).
