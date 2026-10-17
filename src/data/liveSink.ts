import type { SupabaseClient } from "@supabase/supabase-js";
import { LiveSync } from "./live";
import type { SyncSink } from "./store";
import type { StateDiff } from "./sync";
import type { MemberRole } from "../domain/types";

/**
 * Construye el `SyncSink` que traduce un diff del motor a operaciones Supabase.
 *
 * Orden de dependencias (para no violar FKs ni RLS):
 *   1. tournaments  (+ membership del creador si es nuevo → bootstrapping admin)
 *   2. teams, lanes, players (el jugador nuevo también se da de alta como miembro)
 *   3. rounds, assignments, games, inventory, effects, activations, events
 *   4. borrados (en orden inverso para no dejar huérfanas)
 *
 * `actorId` es el `auth.uid()` real; se usa para la membership del jugador.
 * `actorPlayerId` es el `id` en la tabla `players` del usuario actual. Se
 *  necesita para que un jugador (no admin) pueda subir su propio juego en el
 *  self-roll (política `games_update_own`). Si se omite, el jugador no podrá
 *  subir sus propias partidas.
 *
 * Es **tolerante a fallos parciales**: cada fila se empuja de forma aislada y un
 * error (p. ej. el torneo demo con `created_by` "demo-admin", que no es un uuid
 * real, o un torneo ajeno que RLS rechaza) no impide subir el resto. Se conserva
 * el primer error y se relanza al final para que quede registrado en
 * `lastSyncError`, pero solo después de haber intentado todo lo demás.
 */
export function makeLiveSink(
  sb: SupabaseClient,
  actorId: string,
  actorRole: MemberRole = "player",
  /** `id` del jugador en la tabla `players` del usuario actual (para self-roll). */
  actorPlayerId?: string,
): SyncSink {
  const sync = new LiveSync(sb, () => {});

  return async (diff: StateDiff) => {
    let firstError: unknown = null;
    const step = async (fn: () => Promise<void>) => {
      try {
        await fn();
      } catch (e) {
        if (firstError === null) firstError = e;
      }
    };

    const isAdmin = actorRole === "admin";

    // --- 1. Torneos ---
    for (const t of diff.tournaments.upserted) {
      if (t.createdBy !== actorId && !isAdmin) continue;
      await step(async () => {
        await sync.pushTournament(t);
        // Si somos el creador y el torneo es nuevo, garantizamos membership admin.
        if (t.createdBy === actorId) {
          await sync.ensureMembership(t.id, actorId, "admin");
        }
      });
    }

    // --- 2. Equipos, pistas, jugadores ---
    if (isAdmin) {
      for (const x of diff.teams.upserted) await step(() => sync.pushTeam(x));
      for (const x of diff.lanes.upserted) await step(() => sync.pushLane(x));
    }
    for (const p of diff.players.upserted) {
      await step(async () => {
        // ORDEN CRÍTICO: primero la membership y DESPUÉS el player.
        // RLS exige ser miembro para insertar en `players`; al revés el
        // INSERT se rechaza con 403 y el PC nunca ve al jugador (aunque el
        // móvil sí quede como miembro).
        if (p.userId === actorId && p.tournamentId) {
          await sync.ensureMembership(p.tournamentId, actorId, actorRole);
        }
        if (p.userId === actorId || isAdmin) {
          await sync.pushPlayer(p);
        }
      });
    }

    // --- 3. Rondas y todo lo que cuelga de ellas ---
    if (isAdmin) {
      for (const r of diff.rounds.upserted) await step(() => sync.pushRound(r));
      for (const a of diff.assignments.upserted) await step(() => sync.pushAssignment(a));
    }
    // Juegos: admin sube todos; un jugador puede subir su propio juego (self-roll).
    // La política `games_update_own` de Supabase permite UPDATE cuando el
    // player_id del juego corresponde a players.user_id = auth.uid().
    for (const g of diff.games.upserted) {
      if (isAdmin || (actorPlayerId && g.playerId === actorPlayerId)) {
        await step(() => sync.pushGame(g));
      }
    }
    for (const i of diff.inventory.upserted) await step(() => sync.pushInventory(i));
    for (const e of diff.effects.upserted) await step(() => sync.pushEffect(e));
    for (const a of diff.activations.upserted) await step(() => sync.pushActivation(a));
    // Eventos: pushEvent es no-op (feed decorativo desactivado). Se mantiene la
    // llamada para no perder el flujo cuando se reactive.
    for (const e of diff.events.upserted) await step(() => sync.pushEvent(e));

    // --- 4. Borrados (orden inverso aprox.) ---
    for (const id of diff.effects.deleted) await step(() => sync.deleteEffect(id));
    for (const id of diff.inventory.deleted) await step(() => sync.deleteInventory(id));
    if (isAdmin) {
      for (const key of diff.games.deleted) await step(() => sync.deleteGameByKey(key));
      for (const id of diff.assignments.deleted) await step(() => sync.deleteAssignment(id));
      for (const id of diff.rounds.deleted) await step(() => sync.deleteRound(id));
    }
    for (const id of diff.players.deleted) await step(() => sync.deletePlayer(id));
    if (isAdmin) {
      for (const id of diff.lanes.deleted) await step(() => sync.deleteLane(id));
      for (const id of diff.teams.deleted) await step(() => sync.deleteTeam(id));
    }
    // Nota: no borramos torneos desde el cliente (se archivan por status).

    if (firstError !== null) throw firstError;
  };
}
