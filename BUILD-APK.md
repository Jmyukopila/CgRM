# Compilar la APK de Casa Gracia (Android Studio)

Guía para generar la APK. El proyecto ya está preparado: proyecto nativo `app/android/`
generado, `applicationId = com.casagracia.app`, y la URL del backend configurable sin
tocar código.

## ⚠️ Antes de nada: 1 valor obligatorio

La app **no** trae ninguna URL hardcodeada. En un APK instalado ya no existe el host del
bundler de Expo, así que la URL del servidor se lee de `app/app.json`:

```jsonc
"extra": {
  "apiUrl": "https://TU-SERVIDOR.com"   // ← reemplaza por la URL pública HTTPS real
}
```

Reglas:
- Debe ser **HTTPS**. El APK de release bloquea tráfico HTTP en claro (Android cleartext),
  así que un `http://` no conectará. Un servidor detrás de HTTPS (Railway, Render, Fly,
  VPS con Caddy/Nginx+Let's Encrypt…) funciona sin más.
- Sin dominio propio aún, cualquier plataforma que dé una URL `https://*.up.railway.app`
  o similar sirve.
- Si cambias `apiUrl` **después** de haber generado `android/`, vuelve a correr
  `npx expo prebuild -p android --clean` (o simplemente reconstruye: la task de Gradle de
  Expo relee `app.json` al empaquetar).

## El servidor (API Node + Postgres)

El backend vive en `server/`. Para que la app conecte necesitas desplegarlo y que tenga
estas variables de entorno (ver `server/.env.example`):

| Variable | Qué es |
|---|---|
| `DATABASE_URL` | Cadena de conexión de Neon/Postgres (con `sslmode=require`). |
| `CGRM_JWT_SECRET` | Secreto para firmar sesiones. **Obligatorio** con `NODE_ENV=production` (si falta, el arranque aborta). Genéralo con `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. |
| `NODE_ENV` | `production`. |
| `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` | Storage de evidencias (fotos/vídeos). |
| `PORT` | Puerto (por defecto 4000). |

`server/.env` está en `.gitignore` y **no** se sube. No hay credenciales en el código:
todo sale del entorno.

## Compilar la APK en Android Studio

1. Genera (o regenera) el proyecto nativo — ya está hecho, solo repítelo si tocas config nativa:
   ```bash
   cd app
   npx expo prebuild -p android
   ```
2. Abre **Android Studio** → *Open* → selecciona la carpeta `app/android`.
   Deja que Gradle sincronice (la primera vez descarga dependencias).
3. Menú **Build → Build Bundle(s) / APK(s) → Build APK(s)**.
4. Al terminar, *locate* te lleva al `.apk`:
   `app/android/app/build/outputs/apk/debug/app-debug.apk`

Ese `app-debug.apk` sirve para instalar y probar. Para una APK de **release** firmada
(distribución real) hay que configurar un keystore — dímelo y lo dejo montado.

### Alternativa por terminal (sin abrir el IDE)
```bash
cd app/android
./gradlew assembleDebug      # APK de debug
```

## Checklist de estado (verificado)

- ✅ `api.ts` ya no cae a `localhost` en el APK: lee `EXPO_PUBLIC_API_URL` → `extra.apiUrl` → (solo en dev) host del bundler.
- ✅ `applicationId com.casagracia.app`, `versionCode 1`, `versionName 1.0.0`.
- ✅ Permiso `INTERNET` presente; sin cleartext (fuerza HTTPS en release = más seguro).
- ✅ DB: conexión por `DATABASE_URL` con SSL real (Neon), sin credenciales en código.
- ✅ JWT: secreto por entorno, arranque abortado en producción si falta.
- ✅ Sin secretos versionados (`server/.env` ignorado; `.env.example` es solo plantilla).
- ⏳ Pendiente tuyo: poner `apiUrl` real y desplegar el servidor.
