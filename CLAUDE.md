# CLAUDE.md

Quick reference for CgRM (Hotel Casa Gracia operations app). For full context, see memory: **Arquitectura CgRM** (stack, domain, roles, evidence) and **Despliegue actual** (web + PWA status).

## Quick Start

**Backend**: `cd server && npm install && npm run migrate && npm start` (runs `:4000`)
**Frontend**: `cd app && npm install && npx expo start` (QR for Expo Go)

**server/.env** (user-created, `.gitignore`'d):
- `DATABASE_URL`: Neon connection (see memory: **Despliegue actual**)
- `CGRM_JWT_SECRET`: Required in production
- `STORAGE_DRIVER`: `supabase` (prod) or `local` (dev)
- `SUPABASE_*`: Only if using Supabase driver

**app/app.json**: `extra.apiUrl` must be HTTPS in production. Changing it? Run `npx expo prebuild -p android --clean`

## Commands

| Command | Purpose |
|---------|---------|
| `npm run migrate` | Apply `db/schema.sql` to Postgres (idempotent) |
| `npm run sync` | Upsert seed data (non-destructive, safe for production) |
| `npm run seed -- --reseed` | **DESTRUCTIVE**: Clear all data (dev only) |
| `npx expo run:android` \| `:ios` | Build/run on device/emulator |
| `npx expo export -p web` | Build static web export |

## Critical Implementation Details

**Postgres**: `COUNT(*)` returns string; cast with `::int`. SSL: `server/src/db.js` validates certs via `rejectUnauthorized: true`. All queries are async. See memory: **Arquitectura CgRM**.

**Evidence**: Files go directly to Supabase/local, not via API (POST `/api/upload-url` signs, client uploads). Required-evidence points block task closure (no workaround). See memory: **Arquitectura CgRM**.

**Roles**: `empleado` < `jefe` < `admin`, each with `area`. Access control in `server/src/permissions.js`. **No self-signing**: if `jefe` does the task, their superior verifies.

**Cold-start**: Render hibernates after 15 min; `app/src/lib/api.ts` pings `/health` on launch. `REQUEST_TIMEOUT_MS=60s` allows wake-up.

## Deployment

- **Web**: Vercel (push to `main`). See `app/vercel.json` (uses `npx expo export -p web`, rewrites for dynamic routes).
- **Server**: Render `cgrm.onrender.com` (push to `master`). Ensure `NODE_ENV=production`, `DATABASE_URL` (Neon), `CGRM_JWT_SECRET` set.
- **APK**: Use `/apk-build` or `BUILD-APK.md`. Pospuesto; `app/android/` ready when needed.

## Files at a Glance

| Path | Purpose |
|------|---------|
| `server/src/index.js` | Express + all routes |
| `server/src/permissions.js` | Role/area access control |
| `app/src/app/` | Screens (expo-router file-based) |
| `app/app.json` | Expo config |
| `server/db/schema.sql` | DB schema (idempotent) |
