import type {
  ActiveEffect,
  GameEvent,
  InventoryItem,
  Lane,
  LaneAssignment,
  ModifierActivation,
  Player,
  PlayerGame,
  Round,
  Team,
  Tournament,
} from "../domain/types";

/**
 * Capa de sincronización con Supabase.
 *
 * El motor trabaja con un modelo en camelCase (`EngineState`); Postgres usa
 * snake_case y algunos nombres distintos (`order` → `sort_order`). Este módulo
 * contiene el **mapeo puro** entre ambos (ver `live.test.ts`) y un `LiveSync`
 * que hace push/suscripción Realtime.
 *
 * No se auto-conecta: el modo demo (localStorage) sigue siendo el por defecto.
 * Actívalo desde la UI cuando existan `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.
 */

type Row = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Helpers genéricos de renombrado de campos
// ---------------------------------------------------------------------------

/** Convierte un objeto del motor a fila SQL renombrando los campos indicados. */
function toRow<T extends Row>(obj: T, map: Record<string, string>): Row {
  const out: Row = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    out[map[k] ?? k] = v;
  }
  return out;
}

/** Convierte una fila SQL al modelo del motor. Invierte `map` automáticamente. */
function fromRow<T>(row: Row, map: Record<string, string>): T {
  const reverse: Record<string, string> = {};
  for (const [k, v] of Object.entries(map)) reverse[v] = k;
  const out: Row = {};
  for (const [k, v] of Object.entries(row)) {
    out[reverse[k] ?? k] = v;
  }
  return out as unknown as T;
}

// mapas: camelCase (motor) -> snake_case (SQL). Las claves no listadas se mantienen.
const TOURNAMENT_MAP: Record<string, string> = {
  accessCode: "access_code",
  createdBy: "created_by",
  pausedFrom: "paused_from",
  createdAt: "created_at",
  updatedAt: "updated_at",
};
const TEAM_MAP: Record<string, string> = { tournamentId: "tournament_id", sortOrder: "sort_order" };
const LANE_MAP: Record<string, string> = { tournamentId: "tournament_id", marshalId: "marshal_id" };
const ROUND_MAP: Record<string, string> = {
  tournamentId: "tournament_id",
  modifiersFrozen: "modifiers_frozen",
  startedAt: "started_at",
  completedAt: "completed_at",
};
const ASSIGNMENT_MAP: Record<string, string> = {
  roundId: "round_id",
  laneId: "lane_id",
  playerId: "player_id",
  order: "sort_order",
};
const GAME_MAP: Record<string, string> = {
  playerId: "player_id",
  roundId: "round_id",
  laneId: "lane_id",
  currentFrame: "current_frame",
  scoreStatus: "score_status",
};
const INVENTORY_MAP: Record<string, string> = {
  playerId: "player_id",
  roundId: "round_id",
  modifierId: "modifier_id",
  grantedAt: "granted_at",
  grantedFrame: "granted_frame",
  choiceIds: "choice_ids",
};
const PLAYER_MAP: Record<string, string> = {
  tournamentId: "tournament_id",
  teamId: "team_id",
  userId: "user_id",
  displayName: "display_name",
};
const ACTIVATION_MAP: Record<string, string> = {
  inventoryId: "inventory_id",
  modifierId: "modifier_id",
  actorId: "actor_id",
  targetId: "target_id",
  roundId: "round_id",
  createdAt: "created_at",
};
const EVENT_MAP: Record<string, string> = {
  tournamentId: "tournament_id",
  createdAt: "created_at",
};
const EFFECT_MAP: Record<string, string> = {
  playerId: "player_id",
  roundId: "round_id",
  remainingFrames: "remaining_frames",
};

// ---------------------------------------------------------------------------
// Mapeo por entidad
// ---------------------------------------------------------------------------

export function tournamentToRow(t: Tournament): Row {
  return toRow(t as unknown as Row, TOURNAMENT_MAP);
}
export function tournamentFromRow(row: Row): Tournament {
  return fromRow<Tournament>(row, TOURNAMENT_MAP);
}

export function teamToRow(t: Team): Row {
  return toRow(t as unknown as Row, TEAM_MAP);
}
export function teamFromRow(row: Row): Team {
  return fromRow<Team>(row, TEAM_MAP);
}

export function laneToRow(l: Lane): Row {
  return toRow(l as unknown as Row, LANE_MAP);
}
export function laneFromRow(row: Row): Lane {
  return fromRow<Lane>(row, LANE_MAP);
}

export function roundToRow(r: Round): Row {
  return toRow(r as unknown as Row, ROUND_MAP);
}
export function roundFromRow(row: Row): Round {
  return fromRow<Round>(row, ROUND_MAP);
}

export function assignmentToRow(a: LaneAssignment): Row {
  return toRow(a as unknown as Row, ASSIGNMENT_MAP);
}
export function assignmentFromRow(row: Row): LaneAssignment {
  return fromRow<LaneAssignment>(row, ASSIGNMENT_MAP);
}

export function gameToRow(g: PlayerGame): Row {
  return toRow(g as unknown as Row, GAME_MAP);
}
export function gameFromRow(row: Row): PlayerGame {
  return fromRow<PlayerGame>(row, GAME_MAP);
}

export function inventoryToRow(i: InventoryItem): Row {
  return toRow(i as unknown as Row, INVENTORY_MAP);
}
export function inventoryFromRow(row: Row): InventoryItem {
  return fromRow<InventoryItem>(row, INVENTORY_MAP);
}

export function activationToRow(a: ModifierActivation): Row {
  return toRow(a as unknown as Row, ACTIVATION_MAP);
}
export function activationFromRow(row: Row): ModifierActivation {
  return fromRow<ModifierActivation>(row, ACTIVATION_MAP);
}

export function eventToRow(e: GameEvent): Row {
  return toRow(e as unknown as Row, EVENT_MAP);
}

export function effectToRow(e: ActiveEffect): Row {
  return toRow(e as unknown as Row, EFFECT_MAP);
}
export function effectFromRow(row: Row): ActiveEffect {
  return fromRow<ActiveEffect>(row, EFFECT_MAP);
}

// ---------------------------------------------------------------------------
// Sincronización en vivo (push + Realtime)
// ---------------------------------------------------------------------------

import type { SupabaseClient } from "@supabase/supabase-js";
import type { EngineState } from "./engine";

/**
 * Adaptador de sincronización. Traduce operaciones del motor a upserts/inserts
 * en Supabase y escucha `postgres_changes` para reflejar cambios remotos.
 *
 * Diseño: el motor local sigue siendo la fuente de verdad para el cálculo; aquí
 * solo persistimos y recibimos. La resolución de conflictos por `version` ya la
 * hace el motor (rechaza `expectedVersion` obsoletos), de modo que los upserts
 * incluyen `version` y el backend puede rechazar writes desactualizados.
 */
export class LiveSync {
  constructor(
    private sb: SupabaseClient,
    private onChange: () => void,
  ) {}

  /** Upsert idempotente de una entidad (usa la PK para no duplicar). */
  private async upsert(table: string, row: Row, onConflict: string) {
    const { error } = await this.sb.from(table).upsert(row, { onConflict });
    if (error) throw error;
  }

  async pushTournament(t: Tournament) {
    const row = tournamentToRow(t);
    // Intento INSERT primero (torneo nuevo): evalúa sólo la política INSERT
    // (created_by = auth.uid()) → el creador puede insertar.
    const inserted = await this.sb.from("tournaments").insert(row);
    if (!inserted.error) return;
    // 23505 = unique_violation: el torneo ya existe en la nube.
    if (inserted.error.code === "23505") {
      // Aseguramos membership admin del creador para poder actualizar (RLS
      // exige is_tournament_admin en la política UPDATE). La membership se
      // crea con auth.uid() que coincide con t.createdBy (filtrado en el sink).
      try {
        await this.ensureMembership(t.id, t.createdBy, "admin");
      } catch {
        // Si falla la membership, seguimos intentando el UPDATE abajo.
      }
      const { error } = await this.sb.from("tournaments").update(row).eq("id", t.id);
      // 42501 = RLS (no admin aún): la fila YA está en la nube, ok.
      if (error && error.code !== "42501") throw error;
      return;
    }
    throw inserted.error;
  }

  async pushTeam(team: Team) {
    await this.upsert("teams", teamToRow(team), "id");
  }

  async pushLane(lane: Lane) {
    await this.upsert("lanes", laneToRow(lane), "id");
  }

  async pushPlayer(player: Player) {
    // INSERT puro + fallback UPDATE (igual que pushTournament). Un upsert obliga
    // a PostgREST a evaluar también la política UPDATE (UPDATE no tiene política
    // para jugadores propios, solo para admin → 403 aunque el INSERT pasaría).
    const { error } = await this.sb.from("players").insert(playerToRow(player));
    if (!error) return;
    // 23505 = unique_violation: la fila ya existe (reinscripción).
    if (error.code === "23505") {
      const { error: updErr } = await this.sb
        .from("players")
        .update(playerToRow(player))
        .eq("id", player.id);
      // 42501 = RLS (no admin y fila ajena): la fila YA está en la nube, ok.
      if (updErr && updErr.code !== "42501") throw updErr;
      return;
    }
    throw error;
  }

  async pushRound(round: Round) {
    await this.upsert("rounds", roundToRow(round), "id");
  }

  async pushAssignment(a: LaneAssignment) {
    await this.upsert("round_lane_assignments", assignmentToRow(a), "id");
  }

  async pushGame(g: PlayerGame) {
    // La tabla no expone id en el motor; la unicidad es (round_id, player_id).
    // Intenta UPDATE primero (la fila normalmente ya fue creada por el admin al
    // iniciar la ronda). Si no existe fila en la nube, recurre a upsert.
    const row = gameToRow(g);
    const { error: updErr, count } = await this.sb
      .from("player_games")
      .update(row, { count: "exact" })
      .eq("round_id", g.roundId)
      .eq("player_id", g.playerId);
    if (!updErr && (count ?? 0) > 0) return;
    await this.upsert("player_games", row, "round_id,player_id");
  }

  async pushInventory(i: InventoryItem) {
    await this.upsert("player_inventory", inventoryToRow(i), "id");
  }

  /** Inserta una activación (append-only). `idempotency_key` es UNIQUE en SQL. */
  async pushActivation(a: ModifierActivation) {
    const row = activationToRow(a);
    // El esquema expone idempotency_key; puede venir en payload.idempotencyKey.
    if (row.idempotency_key === undefined && typeof a.payload.idempotencyKey === "string") {
      row.idempotency_key = a.payload.idempotencyKey;
    }
    const { error } = await this.sb.from("modifier_activations").insert(row);
    // 23505 = unique_violation → ya existía; lo tratamos como idempotente (ok).
    if (error && error.code !== "23505") throw error;
  }

  async pushEvent(e: GameEvent) {
    // DESACTIVADO: los eventos son solo feed decorativo y su envío rompía la
    // inscripción (primero 403 por RLS, luego 400 en la RPC log_game_event).
    // No-op intencionado hasta tener una RPC estable. Jugadores/rondas siguen
    // sincronizando con normalidad.
    void e;
    return;
  }

  /** Vuelca el estado completo (útil al crear/unirse a un torneo). */
  async pushFullState(state: EngineState, tournamentId: string) {
    const t = state.tournaments.find((x) => x.id === tournamentId);
    if (t) await this.pushTournament(t);
    for (const x of state.teams.filter((y) => y.tournamentId === tournamentId)) await this.pushTeam(x);
    for (const x of state.lanes.filter((y) => y.tournamentId === tournamentId)) await this.pushLane(x);
    for (const x of state.players.filter((y) => y.tournamentId === tournamentId)) await this.pushPlayer(x);
    const roundIds = new Set(state.rounds.filter((r) => r.tournamentId === tournamentId).map((r) => r.id));
    for (const r of state.rounds.filter((x) => x.tournamentId === tournamentId)) await this.pushRound(r);
    for (const a of state.assignments.filter((x) => roundIds.has(x.roundId))) await this.pushAssignment(a);
    for (const g of state.games.filter((x) => roundIds.has(x.roundId))) await this.pushGame(g);
    for (const i of state.inventory.filter((x) => roundIds.has(x.roundId))) await this.pushInventory(i);
  }

  /** Sube un efecto activo (upsert por id). */
  async pushEffect(e: ActiveEffect) {
    const { error } = await this.sb
      .from("active_effects")
      .upsert(effectToRow(e), { onConflict: "id" });
    if (error) throw error;
  }

  /**
   * Inscribe al usuario actual en un torneo de forma atómica (RPC segura).
   *
   * La RPC `join_tournament` crea la membership + la fila `players` en una
   * sola transacción SECURITY DEFINER. Esto evita la condición de carrera del
   * sink: antes el móvil subía el player ANTES de crear su membership, RLS
   * rechazaba el INSERT con 403 y la fila nunca llegaba (el PC no veía al
   * jugador aunque el móvil sí aparecía como miembro). Devuelve el id del player.
   */
  async joinTournament(tournamentId: string, teamId: string, displayName: string, avatar: string): Promise<string> {
    const { data, error } = await this.sb.rpc("join_tournament", {
      p_tournament_id: tournamentId,
      p_team_id: teamId,
      p_display_name: displayName,
      p_avatar: avatar,
    });
    if (error) throw error;
    return data as string;
  }

  /** Borra un efecto activo por id. No-op si no existe. */
  async deleteEffect(id: string) {
    const { error } = await this.sb.from("active_effects").delete().eq("id", id);
    if (error) throw error;
  }

  /** Borra una fila de inventario por id. No-op si no existe. */
  async deleteInventory(id: string) {
    const { error } = await this.sb.from("player_inventory").delete().eq("id", id);
    if (error) throw error;
  }

  /**
   * Borra una partida por su clave natural `playerId|roundId`
   * (coincide con el unique (round_id, player_id) de la tabla).
   */
  async deleteGameByKey(key: string) {
    const [playerId, roundId] = key.split("|");
    const { error } = await this.sb
      .from("player_games")
      .delete()
      .eq("player_id", playerId)
      .eq("round_id", roundId);
    if (error) throw error;
  }

  /** Borra una asignación pista-jugador por id. No-op si no existe. */
  async deleteAssignment(id: string) {
    const { error } = await this.sb.from("round_lane_assignments").delete().eq("id", id);
    if (error) throw error;
  }

  /** Borra una ronda por id. No-op si no existe. */
  async deleteRound(id: string) {
    const { error } = await this.sb.from("rounds").delete().eq("id", id);
    if (error) throw error;
  }

  /** Borra un jugador por id. No-op si no existe. */
  async deletePlayer(id: string) {
    const { error } = await this.sb.from("players").delete().eq("id", id);
    if (error) throw error;
  }

  /** Borra una pista por id. No-op si no existe. */
  async deleteLane(id: string) {
    const { error } = await this.sb.from("lanes").delete().eq("id", id);
    if (error) throw error;
  }

  /** Borra un equipo por id. No-op si no existe. */
  async deleteTeam(id: string) {
    const { error } = await this.sb.from("teams").delete().eq("id", id);
    if (error) throw error;
  }


  /**
   * Garantiza mi fila de tournament_members via RPC segura.
   *
   * Usa ensure_my_membership (SECURITY DEFINER): nunca degrada un admin
   * existente y convierte al creador en admin aunque se pida "player".
   */
  async ensureMembership(tournamentId: string, _userId: string, role: "admin" | "lane_marshal" | "player") {
    void _userId;
    const { error } = await (this.sb as unknown as { rpc: (fn: string, args: Record<string, string>) => Promise<{ error: unknown }> }).rpc("ensure_my_membership", {
      tid: tournamentId,
      requested_role: role,
    });
    if (error) throw error;
  }

  /**
   * Se suscribe a cambios en tiempo real del torneo.
   */
  subscribeTournament(tournamentId: string): () => void {
    // Tablas con columna tournament_id (filtrables directamente).
    const byTournament = [
      "tournaments",
      "teams",
      "lanes",
      "players",
      "rounds",
      "game_events",
    ];
    // Tablas que cuelgan de round_id (sin tournament_id): se escuchan sin filtro
    // y el store local ya acota por torneo al aplicar el refresh.
    const byRound = [
      "round_lane_assignments",
      "player_games",
      "player_inventory",
      "modifier_activations",
      "active_effects",
    ];
    const channel = this.sb.channel(`tournament:${tournamentId}`);
    for (const table of byTournament) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table, filter: `tournament_id=eq.${tournamentId}` },
        () => this.onChange(),
      );
    }
    for (const table of byRound) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        () => this.onChange(),
      );
    }
    channel.subscribe();
    return () => {
      void this.sb.removeChannel(channel);
    };
  }
}

export function eventFromRow(row: Row): GameEvent {
  return fromRow<GameEvent>(row, EVENT_MAP);
}

/**
 * `players` tiene `uniqueKey` en el motor, que no existe como columna en SQL.
 * Al subir se descarta; al bajar se deriva de `user_id`.
 */
export function playerToRow(p: Player): Row {
  // `uniqueKey` no existe en SQL; se deriva de `user_id` al bajar. Se descarta
  // antes del upsert para que PostgREST no falle en `check` ni `function`.
  const { uniqueKey: _uniqueKey, ...rowToUpload } = p;
  void _uniqueKey;
  return toRow(rowToUpload as unknown as Row, PLAYER_MAP);
}
export function playerFromRow(row: Row): Player {
  const p = fromRow<Player>(row, PLAYER_MAP);
  if (!p.uniqueKey) p.uniqueKey = String(row.user_id ?? "");
  return p;
}
