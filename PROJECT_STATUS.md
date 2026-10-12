# 📊 Estado del proyecto · BOWLING PARTY (Kart Bowling)

> Documento de continuidad para que otro agente pueda retomar el trabajo sin repetir análisis.
> Última actualización: fase 1 de recuperación (build arreglado, tests verdes).

## 1. Qué es

Aplicación web de **torneos de bolos presenciales** con estética arcade:

- **3 rondas** (caos con objetos → clasificatoria → gran final por grupos).
- **Equipos ≠ pistas**: cada pista mezcla jugadores de equipos distintos.
- **Modificadores estilo Mario Kart**: objetos que se otorgan en *checkpoints* de frame, con
  rareza ponderada por posición en la pista (los últimos tienen más objetos épicos).
- **Puntuación oficial ten-pin** intacta (strikes, spares, 10.º frame con bonus).
- **Tiempo real** pensado para Supabase (Realtime) y despliegue en **GitHub Pages**.
- Modo **demo aislado** (localStorage) claramente etiquetado, separado del modo real.

## 2. Stack y arquitectura

| Capa | Tecnología |
|------|-----------|
| UI | React 19 + TypeScript estricto |
| Build | Vite 6 + `@vitejs/plugin-react` |
| Estilos | Tailwind 3 (tema arcade en `tailwind.config.js` + `.card-arcade`/`.btn-arcade` en `index.css`) |
| Animación | framer-motion |
| Routing | react-router-dom 7 con **HashRouter** (compatible con GitHub Pages sin servidor) |
| Iconos | lucide-react |
| QR | qrcode.react |
| Backend | Supabase (auth anónima + admin; esquema en `supabase/migrations/001_schema.sql`) |
| Tests | Vitest 3 + jsdom + @testing-library |

### Estructura de carpetas (`src/`)

```
src/
├─ domain/        # LÓGICA PURA (sin React). El corazón del juego.
│  ├─ bowling.ts      → puntuación oficial, frames, validación de rolls
│  ├─ modifiers.ts    → catálogo de objetos, activación, efectos por lanzamiento
│  ├─ assignment.ts   → reparto de jugadores en pistas (spread anti-compañeros)
│  ├─ rankings.ts     → ranking de jugadores/equipos, merge de rondas
│  ├─ finals.ts       → grupos superior/inferior, bloqueo de puestos
│  ├─ lanePlaces.ts   → ranking por pista
│  ├─ ids.ts          → uid, accessCode, mulberry32 (RNG determinista)
│  └─ types.ts        → TODOS los tipos + defaults + paleta/avatares
├─ data/          # MOTOR + persistencia
│  ├─ engine.ts       → funciones puras sobre EngineState (concurrencia + idempotencia)
│  ├─ store.ts        → PartyStore (localStorage + pub/sub) usado por la UI
│  ├─ supabase.ts     → cliente Supabase + auth (signInAnonymously, admin, linkEmail)
│  └─ demoSeed.ts     → construcción del torneo demo de ejemplo
├─ game/
│  └─ GameContext.tsx → sesión, modo demo/live, mute, reduced-motion, conexión
├─ pages/         # 9 pantallas (Home, Tournaments, Join, Player, LaneView,
│                 #  Standings, Spectator, Finals+Hub, Admin×3)
├─ ui/            # Shell (layout + BigButton/Title/Flash), audio (beeper), labels
├─ App.tsx        # rutas
└─ main.tsx       # HashRouter + GameProvider + registro del service worker
```

### Modelo de datos (dominio)

`EngineState` agrupa: `tournaments, teams, lanes, players, rounds, assignments, games,
inventory, activations, effects, events, audit, finalGroups, seenKeys`.

El motor es **puro y determinista**: las mutaciones reciben `expectedVersion` (control de
concurrencia optimista) e `idempotencyKey` (evita duplicados). Esta es la base para luego
sincronizar con Supabase sin condiciones de carrera.

## 3. Estado verificado (fase 1)

| Comprobación | Resultado |
|--------------|-----------|
| `npm install` | ✅ 182 paquetes (+ `@types/node` añadido) |
| `npm test` (Vitest) | ✅ **37/37 tests** en 5 ficheros |
| `npm run build` (`tsc -b && vite build`) | ✅ **compila**; genera `dist/` con code-splitting |
| Errores de TypeScript previos | ✅ **corregidos** (ver sección 5) |
| Conexión Supabase | ⚠️ **código listo, sin credenciales** (no hay `.env.local`) |

### Tests existentes (no borrar, ampliar)

- `src/domain/bowling.test.ts` (10) — 300, spares, strikes, 10.º frame, validación.
- `src/domain/modifiers.test.ts` (13) — bonus/penalización, escudo, robo, objetivos, idempotencia, x3.
- `src/domain/assignment.test.ts` (4) — reparto anti-compañeros + finales.
- `src/data/engine.test.ts` (4) — concurrencia por versión, idempotencia, nombres duplicados.
- `src/data/live.test.ts` (6) — mapeo motor↔SQL (snake_case), `uniqueKey`, `order→sort_order`.

## 4. Estado de Supabase

- `supabase.ts` ya implementa: `supabaseConfigured()`, `getSupabase()`,
  `ensureAnonymousSession()`, `signInAdmin(email, pass)`, `linkEmail(email, pass)`.
- **No hay secretos en el repo.** Las credenciales van en `.env.local` (ignorado por git):
  ```
  VITE_SUPABASE_URL=...
  VITE_SUPABASE_ANON_KEY=...   # solo la clave ANON/pública, NUNCA service_role
  ```
- El esquema `001_schema.sql` crea tablas, índices, enum de estados, trigger `set_updated_at`
  y trigger `handle_new_user` (crea perfil al registrarse).
- **`002_rls.sql` (NUEVO)** añade **Row Level Security** + políticas por pertenencia/rol y
  funciones `SECURITY DEFINER` (`is_tournament_member`, `is_tournament_admin`,
  `lookup_tournament_by_code`). Sin RLS la clave anon podría leer/escribir todo.
- **`src/data/live.ts` (NUEVO)**: mapeo puro motor↔SQL y clase `LiveSync` (upserts +
  suscripción Realtime con `postgres_changes`).
- **`src/data/useLiveSync.ts` (NUEVO)**: hook defensivo que conecta Realtime solo en modo
  "live" y con credenciales; si falla, la app sigue en local y muestra un aviso en el `Shell`.
- `GameContext` expone `liveError`; `Shell` lo muestra sin tumbar la partida.


## 5. Correcciones aplicadas en esta fase (build)

El proyecto llegó con `tsc -b` roto (la lógica y los tests ya funcionaban). Errores y fix:

1. **`store.ts` — "Expected N arguments, but got N+1"** (en cascada a todas las páginas).
   Causa: los métodos usaban `Parameters<typeof fn>`, que incluye el primer parámetro `state`.
   Fix: nuevo helper `type Tail<T>` que descarta el primer parámetro; los métodos ahora usan
   `Tail<Parameters<typeof fn>>`. Sin cambios de comportamiento en runtime.
2. **`GameContext.tsx` — cleanup devolvía boolean.** Fix: bloque `{}` en `subscribe`.
3. **`bowling.ts` — variables muertas** (`tenthComplete`, `currentFrame`, parámetro `frames`
   de `nextMax`). Eliminadas; lógica del 10.º frame intacta y verificada.
4. **`modifiers.ts` — import sin uso** (`pinsOnLastThrow`). Eliminado.
5. **`engine.ts` — `guessTid(state, …)` no usaba `state`.** Simplificado a `guessTid(round)`.
6. **`Admin.tsx` — variable `t` sin uso** en `LanesAdmin`. Eliminada.
7. **`vite.config.ts` — faltaban tipos de Node.** Añadido `@types/node` a devDependencies.

## 5b. Fase 2 · Funcionalidad añadida (seguridad + tiempo real + CI/CD)

Además de arreglar el build, esta fase implementó lo pendiente de mayor prioridad:

1. **Seguridad — `supabase/migrations/002_rls.sql` (NUEVO).** Habilita RLS en las 16 tablas
   y añade políticas por pertenencia/rol + 4 funciones `SECURITY DEFINER`
   (`is_tournament_member`, `is_tournament_admin`, `round_belongs_to_member/admin`,
   `game_belongs_to_admin`, `lookup_tournament_by_code`). Los torneos **no** se listan: se
   entra por código (RPC) o por membresía. `score_adjustments` y `final_groups` solo admin.
2. **Tiempo real — `src/data/live.ts` (NUEVO).** Mapeo puro motor↔SQL (camelCase↔snake_case,
   con `order→sort_order` y `uniqueKey` derivado) + clase `LiveSync` con `upsert`/`insert`
   idempotentes y `subscribeTournament` vía `postgres_changes`. Cubierto por `live.test.ts`.
3. **Integración defensiva — `src/data/useLiveSync.ts` (NUEVO).** Hook que conecta Realtime
   solo si `mode === "live"` y hay credenciales; ante cualquier error la app sigue en local y
   muestra un aviso en el `Shell` (`liveError`). No rompe el modo demo.
4. **CI/CD — `.github/workflows/deploy.yml` (NUEVO).** `npm ci` → `npm test` → `npm run build`
   → publica `dist/` en GitHub Pages con `VITE_BASE_PATH=/$REPO/` y secretos opcionales.
5. **Documentación — `README.md` (NUEVO).** Arranque, scripts, variables de entorno, BD y
   despliegue.
6. **Rendimiento — `vite.config.ts`.** `manualChunks` (react / supabase / motion) para evitar
   un chunk único >500 kB. Build final sin warnings de tamaño.

## 6. Pendiente / siguientes pasos (priorizado)

### A. Push de mutaciones a Supabase — ✅ IMPLEMENTADO (fase 3)
- `src/data/sync.ts`: diff puro del estado (`diffStates`) por clave primaria. Cubierto por
  `sync.test.ts` (6 tests). `PlayerGame` usa clave `(playerId, roundId)`.
- `src/data/liveSink.ts` (`makeLiveSink`): traduce el diff a upserts/inserts/deletes en orden
  de dependencias (tournaments → membership → teams/lanes/players → rounds → games/…).
- `PartyStore` calcula el diff en cada `commit()` y lo envía al sink de forma **asíncrona y no
  bloqueante**; si falla, el estado local no se revierte (el juego sigue) y `lastSyncError`
  queda registrado.
- `GameContext`: en modo "live" asegura sesión anónima (`ensureAnonymousSession`), alinea
  `session.userId` al `auth.uid()` real (RLS se basa en él) y conecta el sink.
- `002_rls.sql` ampliado con INSERT de `tournaments` (bootstrapping del creador).
- ⚠️ **Falta verificar E2E contra el proyecto real** (aplicar `002_rls.sql` actualizado y
  añadir las tablas a `supabase_realtime`). Luego, crear un torneo en modo vivo y comprobar
  que aparece en la tabla `tournaments` y que el creador queda en `tournament_members`.

### B. Carga inicial / hidratación desde Supabase (ALTA)
- Al entrar en modo "live" y suscribirse a Realtime, los `onChange` hoy solo hacen `refresh`
  (re-render con el estado local). Falta **tirar** de las tablas (`*FromRow`) y fusionar en
  `EngineState` para reflejar datos de otros dispositivos. Requiere un merge por `version`.

### C. Rondas en la UI de Admin (MEDIA)
- El motor tiene `startRound`/`completeRound`; falta el asistente de 3 rondas en la UI y el
  guardado de `finalGroups` al cerrar la ronda 3 (`buildFinalPlan`/`lockFinalStandings`).

### D. Pulido (BAJA)
- Tests de integración de `makeLiveSink` con un cliente Supabase mockeado (verificar orden).
- Revisar export CSV/PDF con datos reales.

## 7. Cómo ejecutar (local, Windows)

```powershell
# Node >= 20. En este equipo Node está en "C:\Program Files\nodejs" (añádelo al PATH).
npm install
npm run dev        # http://localhost:5173
npm test           # 37 tests
npm run build      # genera dist/ (compila tsc + vite, con code-splitting)
```

Para modo vivo: copiar `.env.example` a `.env.local` y rellenar
`VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`. Sin esos valores la app arranca en **demo**.

## 8. Notas para el siguiente agente

- **No reconstruir**: la arquitectura dominio→motor→store→UI es sólida y está testeada.
- **No borres los tests**: son la red de seguridad (37 tests). Amplíalos al cablear el push.
- Lo inmediato es **cablear el push de mutaciones a Supabase** (sección 6.A) y **aplicar
  `002_rls.sql`** en el proyecto. Después, hidratar el estado al entrar en modo "live".
- Si cambias firmas del motor, recuerda que `store.ts` usa `Tail<Parameters<…>>`.
- `LiveSync` usa `postgres_changes`; requiere Realtime habilitado y las tablas en la publicación.
