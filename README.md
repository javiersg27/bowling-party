# 🎳 BOWLING PARTY · Kart Bowling

Torneos de bolos presenciales con estética arcade: **3 rondas**, **equipos**,
**pistas mixtas**, **modificadores estilo Mario Kart**, puntuación **en tiempo real**
y despliegue en **GitHub Pages**. Identidad 100 % original (sin personajes protegidos).

![Stack](https://img.shields.io/badge/React-19-149eca?logo=react) ![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?logo=typescript) ![Vite](https://img.shields.io/badge/Vite-6-646cff?logo=vite) ![Supabase](https://img.shields.io/badge/Supabase-Realtime-3ecf8e?logo=supabase)

## ✨ Características

- **Puntuación oficial ten-pin** real (strikes, spares y 10.º frame con bonus) en `src/domain/bowling.ts`.
- **Modificadores** otorgados en *checkpoints* de frame; rareza ponderada por posición
  (los últimos de la pista reciben más objetos épicos) → mecánica anti-liderazgo.
- **Equipos ≠ pistas**: el reparto (`autoSpreadPlayers`) separa a los compañeros de equipo.
- **3 rondas**: caos con objetos → clasificatoria → gran final por grupos superior/inferior.
- **Motor puro y determinista** con control de concurrencia por `version` e **idempotencia**.
- **Dos modos**: *demo aislada* (localStorage, etiquetada) y *en vivo* (Supabase).
- **Modo proyector** (`/t/:code/spectator`), QR de inscripción y export CSV/PDF.

## 🚀 Arranque rápido (local)

Requiere **Node.js ≥ 20**.

```bash
npm install
npm run dev      # http://localhost:5173
```

### Scripts

| Comando | Qué hace |
|---------|----------|
| `npm run dev` | Servidor de desarrollo (Vite). |
| `npm test` | Ejecuta la suite Vitest (31 tests). |
| `npm run build` | Compila TypeScript (`tsc -b`) y genera `dist/`. |
| `npm run preview` | Sirve `dist/` localmente. |

## 🔐 Variables de entorno

La app funciona **sin configuración** en modo demo. Para el modo vivo (Supabase):

1. Copia la plantilla:
   ```bash
   cp .env.example .env.local
   ```
2. Rellena **solo claves públicas** de tu proyecto Supabase:
   ```
   VITE_SUPABASE_URL=https://TU-PROYECTO.supabase.co
   VITE_SUPABASE_ANON_KEY=tu_clave_anon_publicable
   ```

> ⚠️ **Nunca** pongas la `service_role` en el cliente ni en el repo. Esa clave solo vive
> en el backend. `.env.local` está ignorado por git.

`VITE_BASE_PATH` controla la ruta base del build. En local usa `/`. En GitHub Pages se
inyecta automáticamente como `/NOMBRE_REPO/` (ver el workflow).

## 🗄️ Base de datos (Supabase)

Las migraciones están en `supabase/migrations/`:

1. `001_schema.sql` — tablas, enums, índices y triggers.
2. `002_rls.sql` — **Row Level Security** y políticas de pertenencia/rol.

Aplícalas en tu proyecto (SQL editor o `supabase db push`). El acceso con la clave anon
está protegido por RLS: cada torneo se gobierna por `tournament_members` (roles
`player`, `admin`, `lane_marshal`).

## ☁️ Despliegue en GitHub Pages

El repo incluye `.github/workflows/deploy.yml`. Al hacer push a `main`:

1. `npm ci` → `npm test` → `npm run build` (con `VITE_BASE_PATH=/$REPO/`).
2. Publica `dist/` en GitHub Pages.

Pasos una sola vez en GitHub: **Settings → Pages → Source: GitHub Actions**.
Opcionalmente define los secretos `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`
en **Settings → Secrets and variables → Actions** para producción en vivo.

El enrutado usa **HashRouter**, compatible con Pages sin reescrituras de servidor.

## 🧭 Rutas principales

| Ruta | Pantalla |
|------|----------|
| `/` | Inicio |
| `/unirse/:code` | Inscripción con QR |
| `/t/:code` | Hub del torneo |
| `/t/:code/jugador` | Panel de jugador (objetos, objetivos) |
| `/t/:code/pista/:laneId` | Vista de pista (introducir bolos) |
| `/t/:code/clasificacion` | Clasificación |
| `/t/:code/spectator` | Modo proyector |
| `/t/:code/finales` | Cuadro de finales |
| `/admin`, `/admin/nuevo`, `/admin/t/:id` | Dirección del torneo |

## 📁 Estructura

```
src/
├─ domain/   lógica pura (bowling, modifiers, assignment, rankings, finals) + tests
├─ data/     motor (engine), store (localStorage), cliente Supabase, seed demo
├─ game/     GameContext (sesión, modo, sonido, conexión)
├─ pages/    pantallas
└─ ui/       Shell, audio, etiquetas
```

Consulta **`PROJECT_STATUS.md`** para el estado de desarrollo y los siguientes pasos.

## 📄 Licencia

Proyecto propio. Uso libre para tus eventos.
