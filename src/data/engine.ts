import { autoSpreadPlayers } from "../domain/assignment";
import { currentTurnPlayerId } from "../domain/turn";
import { applyRoll, frameJustCompleted, scoreGame, validateRoll } from "../domain/bowling";
import { buildFinalPlan, lockFinalStandings } from "../domain/finals";
import { accessCode, nowIso, uid } from "../domain/ids";
import { laneRanking } from "../domain/lanePlaces";
import {
  clampBonus,
  MODIFIER_CATALOG,
  modifierById,
  PRESETS,
  resolveActivation,
  resolveThrowEffects,
  rollModifier,
  tickEffectsAfterFrame,
  totalScore,
} from "../domain/modifiers";
import { mergeRounds, rankPlayers, rankTeams, roundContribution } from "../domain/rankings";
import {
  AVATARS,
  DEFAULT_MODIFIER_SETTINGS,
  DEFAULT_SCORING,
  TEAM_PALETTE,
  type ActiveEffect,
  type AuditLog,
  type GameEvent,
  type InventoryItem,
  type Lane,
  type LaneAssignment,
  type ModifierActivation,
  type ModifierSettings,
  type Player,
  type PlayerGame,
  type Round,
  type Team,
  type Tournament,
  type TournamentSettings,
  type TournamentStatus,
} from "../domain/types";

export interface EngineState {
  tournaments: Tournament[];
  teams: Team[];
  lanes: Lane[];
  players: Player[];
  rounds: Round[];
  assignments: LaneAssignment[];
  games: PlayerGame[];
  inventory: InventoryItem[];
  activations: ModifierActivation[];
  effects: ActiveEffect[];
  events: GameEvent[];
  audit: AuditLog[];
  finalGroups: { tournamentId: string; upper: string[]; lower: string[]; note: string }[];
  seenKeys: string[];
}

export function emptyState(): EngineState {
  return {
    tournaments: [],
    teams: [],
    lanes: [],
    players: [],
    rounds: [],
    assignments: [],
    games: [],
    inventory: [],
    activations: [],
    effects: [],
    events: [],
    audit: [],
    finalGroups: [],
    seenKeys: [],
  };
}

function emit(state: EngineState, tournamentId: string, type: string, message: string, payload: Record<string, unknown> = {}) {
  state.events.unshift({
    id: uid("ev"),
    tournamentId,
    type,
    message,
    payload,
    createdAt: nowIso(),
  });
  state.events = state.events.slice(0, 400);
}

function audit(state: EngineState, tournamentId: string, actorId: string, action: string, detail: string) {
  state.audit.unshift({ id: uid("au"), tournamentId, actorId, action, detail, createdAt: nowIso() });
}

export function createTournament(
  state: EngineState,
  args: {
    name: string;
    description: string;
    date: string;
    createdBy: string;
    settings: Partial<TournamentSettings> & { laneCount: number; teamCount: number; playersPerLane: number; maxPlayersPerTeam: number };
  },
): Tournament {
  const id = uid("t");
  const modifiers: ModifierSettings = {
    ...DEFAULT_MODIFIER_SETTINGS,
    ...args.settings.modifiers,
    enabledIds:
      args.settings.modifiers?.enabledIds?.length
        ? args.settings.modifiers.enabledIds
        : MODIFIER_CATALOG.map((m) => m.id),
  };
  const tournament: Tournament = {
    id,
    name: args.name,
    description: args.description,
    date: args.date,
    accessCode: uniqueCode(state),
    status: "draft",
    createdBy: args.createdBy,
    settings: {
      maxPlayersPerTeam: args.settings.maxPlayersPerTeam,
      playersPerLane: args.settings.playersPerLane,
      laneCount: args.settings.laneCount,
      teamCount: args.settings.teamCount,
      teamAssignMode: args.settings.teamAssignMode ?? "player_choice",
      laneAssignMode: args.settings.laneAssignMode ?? "auto_spread",
      modifiers,
      scoring: { ...DEFAULT_SCORING, ...args.settings.scoring },
    },
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  state.tournaments.push(tournament);
  for (let i = 0; i < args.settings.teamCount; i++) {
    const pal = TEAM_PALETTE[i % TEAM_PALETTE.length];
    state.teams.push({
      id: uid("team"),
      tournamentId: id,
      name: pal.name,
      color: pal.color,
      accent: pal.accent,
      sortOrder: i,
    });
  }
  for (let i = 0; i < args.settings.laneCount; i++) {
    state.lanes.push({
      id: uid("lane"),
      tournamentId: id,
      name: `Pista ${i + 1}`,
      number: i + 1,
    });
  }
  for (const kind of [1, 2, 3] as const) {
    state.rounds.push({
      id: uid("round"),
      tournamentId: id,
      kind,
      status: "pending",
      modifiersFrozen: null,
    });
  }
  emit(state, id, "created", `Torneo ${tournament.name} creado.`);
  audit(state, id, args.createdBy, "create_tournament", tournament.name);
  return tournament;
}

function uniqueCode(state: EngineState): string {
  for (let i = 0; i < 20; i++) {
    const c = accessCode();
    if (!state.tournaments.some((t) => t.accessCode === c)) return c;
  }
  return accessCode() + uid().slice(0, 2);
}

export function applyPreset(state: EngineState, tournamentId: string, preset: "fun" | "competitive" | "chaos" | "custom") {
  const t = mustTournament(state, tournamentId);
  if (preset === "custom") {
    t.settings.modifiers.preset = "custom";
    return;
  }
  t.settings.modifiers = {
    ...t.settings.modifiers,
    ...PRESETS[preset],
    enabledIds: PRESETS[preset].enabledIds ?? t.settings.modifiers.enabledIds,
  };
}

export function setStatus(state: EngineState, tournamentId: string, status: TournamentStatus, actorId: string) {
  const t = mustTournament(state, tournamentId);
  if (status === "paused") {
    t.pausedFrom = t.status;
    t.status = "paused";
  } else if (t.status === "paused" && status === t.pausedFrom) {
    t.status = t.pausedFrom;
    t.pausedFrom = undefined;
  } else {
    t.status = status;
  }
  t.updatedAt = nowIso();
  emit(state, tournamentId, "status", `Estado: ${status}`);
  audit(state, tournamentId, actorId, "status", status);
}

export function joinTournament(
  state: EngineState,
  args: { code: string; userId: string; displayName: string; avatar: string; teamId?: string },
): Player {
  const t = state.tournaments.find((x) => x.accessCode === args.code.toUpperCase());
  if (!t) throw new Error("Código de torneo no válido.");
  if (t.status !== "registration") throw new Error("Las inscripciones no están abiertas.");
  const name = args.displayName.trim();
  if (name.length < 2) throw new Error("El nombre debe tener al menos 2 caracteres.");
  const existingName = state.players.find(
    (p) => p.tournamentId === t.id && !p.banned && p.displayName.toLowerCase() === name.toLowerCase(),
  );
  if (existingName) throw new Error("Ese nombre ya está inscrito en este torneo.");
  const already = state.players.find((p) => p.tournamentId === t.id && p.userId === args.userId && !p.banned);
  if (already) throw new Error("Ya estás inscrito en este torneo con esta sesión.");
  const teams = state.teams.filter((x) => x.tournamentId === t.id);
  let teamId = args.teamId;
  if (!teamId) {
    if (t.settings.teamAssignMode === "random") {
      teamId = [...teams].sort((a, b) => teamSize(state, a.id) - teamSize(state, b.id))[0]?.id;
    } else {
      throw new Error("Elige un equipo.");
    }
  }
  const team = teams.find((x) => x.id === teamId);
  if (!team) throw new Error("Equipo no válido.");
  if (teamSize(state, team.id) >= t.settings.maxPlayersPerTeam) {
    throw new Error(`El equipo ${team.name} está completo.`);
  }
  const avatar = AVATARS.includes(args.avatar) ? args.avatar : AVATARS[0];
  const player: Player = {
    id: uid("p"),
    tournamentId: t.id,
    userId: args.userId,
    displayName: name,
    avatar,
    teamId: team.id,
    uniqueKey: `${t.id}:${name.toLowerCase()}`,
    banned: false,
  };
  state.players.push(player);
  emit(state, t.id, "join", `${name} se une a ${team.name}.`, { playerId: player.id });
  return player;
}

function teamSize(state: EngineState, teamId: string) {
  return state.players.filter((p) => p.teamId === teamId && !p.banned).length;
}

export function kickPlayer(state: EngineState, playerId: string, actorId: string) {
  const p = state.players.find((x) => x.id === playerId);
  if (!p) throw new Error("Jugador no encontrado.");
  p.banned = true;
  audit(state, p.tournamentId, actorId, "kick", p.displayName);
  emit(state, p.tournamentId, "kick", `${p.displayName} ha sido expulsado.`);
}

export function distributeLanes(state: EngineState, tournamentId: string, roundKind: 1 | 2 | 3) {
  const t = mustTournament(state, tournamentId);
  const players = state.players.filter((p) => p.tournamentId === tournamentId && !p.banned);
  const teams = state.teams.filter((x) => x.tournamentId === tournamentId);
  const lanes = state.lanes.filter((x) => x.tournamentId === tournamentId);
  const round = mustRound(state, tournamentId, roundKind);
  const result = autoSpreadPlayers({
    players,
    teams,
    lanes,
    playersPerLane: t.settings.playersPerLane,
  });
  if (!result.ok) throw new Error(result.reason ?? "No se pudo asignar pistas.");
  state.assignments = state.assignments.filter((a) => a.roundId !== round.id);
  state.games = state.games.filter((g) => g.roundId !== round.id);
  for (const p of result.placements) {
    state.assignments.push({ id: uid("as"), roundId: round.id, laneId: p.laneId, playerId: p.playerId, order: p.order });
    state.games.push({
      playerId: p.playerId,
      roundId: round.id,
      laneId: p.laneId,
      rolls: [],
      official: 0,
      bonus: 0,
      total: 0,
      currentFrame: 1,
      complete: false,
      scoreStatus: "pending",
      version: 0,
    });
  }
  return result;
}

export function startRound(state: EngineState, tournamentId: string, actorId: string) {
  const t = mustTournament(state, tournamentId);
  if (t.status === "paused" || t.status === "cancelled" || t.status === "archived") {
    throw new Error("El torneo no puede iniciar rondas en este estado.");
  }
  const live = state.rounds.find((r) => r.tournamentId === tournamentId && r.status === "live");
  if (live) throw new Error("Ya hay una ronda en curso. Complétala antes de avanzar.");
  const next = state.rounds
    .filter((r) => r.tournamentId === tournamentId && r.status === "pending")
    .sort((a, b) => a.kind - b.kind)[0];
  if (!next) throw new Error("No quedan rondas pendientes.");
  if (next.kind > 1) {
    const prev = mustRound(state, tournamentId, (next.kind - 1) as 1 | 2);
    if (prev.status !== "completed") throw new Error("Completa la ronda anterior primero.");
  }
  const kind = next.kind;
  if (kind === 3) prepareFinals(state, tournamentId);
  else distributeLanes(state, tournamentId, kind);
  const round = mustRound(state, tournamentId, kind);
  const frozen = structuredClone(t.settings.modifiers);
  frozen.snapshotAt = nowIso();
  round.modifiersFrozen = frozen;
  round.status = "live";
  round.startedAt = nowIso();
  t.status = kind === 1 ? "round_1" : kind === 2 ? "round_2" : "round_3";
  emit(state, tournamentId, "round", `Comienza la ronda ${kind}.`);
  audit(state, tournamentId, actorId, "start_round", String(kind));
}

function prepareFinals(state: EngineState, tournamentId: string) {
  const t = mustTournament(state, tournamentId);
  const teams = state.teams.filter((x) => x.tournamentId === tournamentId);
  const players = state.players.filter((p) => p.tournamentId === tournamentId && !p.banned);
  const lanes = state.lanes.filter((x) => x.tournamentId === tournamentId);
  const ranked = currentTeamRanking(state, tournamentId);
  const plan = buildFinalPlan({
    rankedTeams: ranked,
    teams,
    players,
    lanes,
    playersPerLane: t.settings.playersPerLane,
    settings: t.settings.scoring,
  });
  state.finalGroups = state.finalGroups.filter((g) => g.tournamentId !== tournamentId);
  state.finalGroups.push({ tournamentId, upper: plan.upper, lower: plan.lower, note: plan.note });
  const round = mustRound(state, tournamentId, 3);
  state.assignments = state.assignments.filter((a) => a.roundId !== round.id);
  state.games = state.games.filter((g) => g.roundId !== round.id);
  if (!plan.assignments.length) {
    distributeLanes(state, tournamentId, 3);
    return;
  }
  for (const p of plan.assignments) {
    state.assignments.push({ id: uid("as"), roundId: round.id, laneId: p.laneId, playerId: p.playerId, order: p.order });
    state.games.push({
      playerId: p.playerId,
      roundId: round.id,
      laneId: p.laneId,
      rolls: [],
      official: 0,
      bonus: 0,
      total: 0,
      currentFrame: 1,
      complete: false,
      scoreStatus: "pending",
      version: 0,
    });
  }
  emit(state, tournamentId, "finals", plan.note);
}

export function completeRound(state: EngineState, tournamentId: string, actorId: string) {
  const t = mustTournament(state, tournamentId);
  const kind: 1 | 2 | 3 = t.status === "round_1" ? 1 : t.status === "round_2" ? 2 : 3;
  const round = mustRound(state, tournamentId, kind);
  round.status = "completed";
  round.completedAt = nowIso();
  for (const item of state.inventory.filter((i) => i.roundId === round.id && i.status === "held")) {
    item.status = "expired";
  }
  if (kind === 3) t.status = "finished";
  if (kind === 3) {
    const groups = state.finalGroups.find((g) => g.tournamentId === tournamentId);
    if (groups) {
      const r3 = playerPointsForRound(state, tournamentId, 3);
      const prev = mergeRounds(
        state.players.filter((p) => p.tournamentId === tournamentId),
        [
          { round: 1, points: playerPointsForRound(state, tournamentId, 1) },
          { round: 2, points: playerPointsForRound(state, tournamentId, 2) },
        ],
        t.settings.scoring,
      );
      const teamPrev = rankTeams(state.teams.filter((x) => x.tournamentId === tournamentId), prev);
      const teamR3 = rankTeams(
        state.teams.filter((x) => x.tournamentId === tournamentId),
        rankPlayers(state.players.filter((p) => p.tournamentId === tournamentId), r3, []),
      );
      lockFinalStandings({
        upperTeamIds: groups.upper,
        lowerTeamIds: groups.lower,
        round3TeamOrder: teamR3.map((row) => ({
          teamId: row.teamId,
          points: row.tournamentPoints,
          previous: teamPrev.find((p) => p.teamId === row.teamId)?.tournamentPoints ?? 0,
        })),
      });
    }
  }
  // ── Reparto de modificadores al finalizar la ronda ──────────────────────
  // Todos los jugadores reciben un objeto, orden inverso por puntuación:
  // menor puntuación = objetos mejores (épicos), mayor puntuación = objetos peores (comunes)
  const roundPoints = playerPointsForRound(state, tournamentId, kind);
  const roundPlayers = state.players.filter(
    (p) => p.tournamentId === tournamentId && !p.banned,
  );
  const scoreMap = new Map(roundPoints.map((rp) => [rp.playerId, rp]));
  const ranked = [...roundPlayers]
    .map((p) => {
      const pts = scoreMap.get(p.id) ?? { official: 0, bonus: 0, playerId: p.id };
      return { playerId: p.id, total: totalScore(pts.official, pts.bonus) };
    })
    .sort((a, b) => a.total - b.total); // ascendente: peor puntuado primero

  const roundSettings = round.modifiersFrozen ?? t.settings.modifiers;
  const enabled = MODIFIER_CATALOG.filter((m) =>
    roundSettings.enabledIds.includes(m.id),
  );

  for (let i = 0; i < ranked.length; i++) {
    const { playerId } = ranked[i];
    const place = i + 1;
    const weights =
      place === 1
        ? roundSettings.weightsByPlace.last      // peor puntuado → objetos épicos (mejores)
        : place === ranked.length
          ? roundSettings.weightsByPlace.first   // mejor puntuado → objetos comunes (peores)
          : roundSettings.weightsByPlace.middle;
    const picked = rollModifier(enabled, weights, Math.random);
    if (!picked) continue;
    state.inventory.push({
      id: uid("inv"),
      playerId,
      roundId: round.id,
      modifierId: picked.id,
      status: "held",
      grantedAt: nowIso(),
      grantedFrame: 10, // fin de ronda / juego completo
    });
    const player = state.players.find((p) => p.id === playerId)!;
    emit(state, tournamentId, "item", `¡${player.displayName} consigue ${picked.name}!`, {
      rarity: picked.rarity,
      playerId: player.id,
    });
  }

  emit(state, tournamentId, "round_done", `Ronda ${kind} finalizada.`);
  audit(state, tournamentId, actorId, "complete_round", String(kind));
}

export function recordRoll(
  state: EngineState,
  args: {
    playerId: string;
    roundId: string;
    pins: number;
    actorId: string;
    expectedVersion: number;
    idempotencyKey: string;
    exceptionalTotal?: number;
  },
) {
  if (state.seenKeys.includes(args.idempotencyKey)) return;
  const game = state.games.find((g) => g.playerId === args.playerId && g.roundId === args.roundId);
  if (!game) throw new Error("Participación no encontrada.");
  const round = state.rounds.find((r) => r.id === args.roundId);
  if (!round || round.status !== "live") throw new Error("La ronda no está en curso.");
  const player = state.players.find((p) => p.id === args.playerId)!;
  const t = mustTournament(state, player.tournamentId);
  if (t.status === "paused") throw new Error("El torneo está en pausa.");

  // Orden de turno: solo puede tirar el jugador al que le toca en esta pista.
  // Avanzamos frame a frame y, dentro de un frame, por `assignment.order` ascendente.
  const turnId = currentTurnPlayerId(state.games, state.assignments, game.laneId, args.roundId);
  const turnPlayer = turnId ? state.players.find((p) => p.id === turnId) : undefined;
  if (turnId === null || args.playerId !== turnId) {
    const quien = turnPlayer ? `Le toca a ${turnPlayer.displayName}.` : "No hay turno activo en esta pista.";
    throw new Error(`No es tu turno de tirar. ${quien}`);
  }

  if (game.version !== args.expectedVersion) {
    throw new Error("El marcador ha cambiado. Recarga e inténtalo de nuevo (concurrencia).");
  }
  if (args.exceptionalTotal != null) {
    if (args.exceptionalTotal < 0 || args.exceptionalTotal > 300) throw new Error("Total excepcional inválido.");
    game.rolls = expandTotalToRolls(args.exceptionalTotal);
    game.scoreStatus = "corrected";
    audit(state, t.id, args.actorId, "exceptional_total", `${player.displayName}: ${args.exceptionalTotal}`);
  } else {
    const err = validateRoll(game.rolls, args.pins);
    if (err) throw new Error(err);
    const previous = game.rolls;
    game.rolls = applyRoll(game.rolls, args.pins);
    const snap = snapshotPlayer(state, game);
    const throwFx = resolveThrowEffects({ player: snap, pins: args.pins, settings: round.modifiersFrozen ?? t.settings.modifiers });
    applyPatches(state, game.roundId, throwFx.patches);
    state.effects = state.effects.filter((e) => !throwFx.consumeEffectIds.includes(e.id));
    const completed = frameJustCompleted(previous, game.rolls);
    if (completed) {
      const laneGames = state.games.filter((g) => g.roundId === round.id && g.laneId === game.laneId);
      for (const g of laneGames) {
        state.effects = state.effects.map((e) =>
          e.playerId === g.playerId && e.roundId === round.id
            ? { ...e, remainingFrames: e.remainingFrames }
            : e,
        );
      }
      const actorEffects = state.effects.filter((e) => e.playerId === game.playerId && e.roundId === round.id);
      const ticked = tickEffectsAfterFrame(actorEffects, completed);
      state.effects = state.effects.filter((e) => !(e.playerId === game.playerId && e.roundId === round.id)).concat(ticked);
    }
    if (scoreGame(game.rolls).frames.some((f) => f.isStrike && f.isComplete && f.index === completed)) {
      emit(state, t.id, "strike", `¡${player.displayName} ha hecho STRIKE!`, { playerId: player.id });
    }
    if (scoreGame(game.rolls).frames.some((f) => f.isSpare && f.isComplete && f.index === completed)) {
      emit(state, t.id, "spare", `¡${player.displayName} ha hecho spare!`, { playerId: player.id });
    }
  }
  refreshGame(game);
  game.version += 1;
  game.scoreStatus = game.scoreStatus === "corrected" ? "corrected" : "confirmed";
  state.seenKeys.push(args.idempotencyKey);
  emit(state, t.id, "roll", `${player.displayName} derriba ${args.pins}`, { playerId: player.id, pins: args.pins });
}

function modifiersOn(_round: Round, _t: Tournament) {
  return true;
}

export function activateModifier(
  state: EngineState,
  args: {
    inventoryId: string;
    actorPlayerId: string;
    targetPlayerId?: string;
    payload?: Record<string, unknown>;
    idempotencyKey: string;
  },
) {
  if (state.seenKeys.includes(args.idempotencyKey)) return;
  const item = state.inventory.find((i) => i.id === args.inventoryId);
  if (!item) throw new Error("Objeto no encontrado.");
  const game = state.games.find((g) => g.playerId === args.actorPlayerId && g.roundId === item.roundId);
  if (!game) throw new Error("No estás en esta ronda.");
  const round = state.rounds.find((r) => r.id === item.roundId)!;
  const actorP = state.players.find((p) => p.id === args.actorPlayerId)!;
  const t = mustTournament(state, actorP.tournamentId);
  const settings = round.modifiersFrozen ?? t.settings.modifiers;
  const laneGames = state.games.filter((g) => g.roundId === round.id && g.laneId === game.laneId);
  const ranking = laneRanking(laneGames);
  const snap = (pid: string) => {
    const g = state.games.find((x) => x.playerId === pid && x.roundId === round.id)!;
    return snapshotFrom(state, g, ranking);
  };
  const actor = snap(args.actorPlayerId);
  const target = args.targetPlayerId ? snap(args.targetPlayerId) : undefined;
  const outcome = resolveActivation({
    actor,
    target,
    modifierId: item.modifierId,
    inventoryId: item.id,
    roundKind: round.kind,
    modifiersEnabled: modifiersOn(round, t),
    settings,
    frame: game.currentFrame,
    now: nowIso(),
    idempotencyKey: args.idempotencyKey,
    seenKeys: new Set(state.seenKeys),
    payload: args.payload,
    rng: Math.random,
    lanePlayers: laneGames.map((g) => snap(g.playerId)),
  });
  if (!outcome.ok && outcome.status === "blocked") throw new Error(outcome.error);
  applyPatches(state, round.id, outcome.patches);
  for (const fx of outcome.newEffects) {
    state.effects.push({ ...fx, roundId: round.id, id: uid("fx") });
  }
  state.effects = state.effects.filter((e) => !outcome.removeEffectIds.includes(e.id));
  if (outcome.consumeInventory) item.status = "activated";
  if (outcome.swapInventory) {
    const a = state.inventory.find((i) => i.id === outcome.swapInventory!.a)!;
    const b = state.inventory.find((i) => i.id === outcome.swapInventory!.b)!;
    const tmp = a.playerId;
    a.playerId = b.playerId;
    b.playerId = tmp;
  }
  for (const g of outcome.extraGrants) {
    const held = state.inventory.filter((i) => i.playerId === g.playerId && i.roundId === round.id && i.status === "held");
    if (held.length >= settings.inventoryLimit) continue;
    state.inventory.push({
      id: uid("inv"),
      playerId: g.playerId,
      roundId: round.id,
      modifierId: g.modifierId,
      status: "held",
      grantedAt: nowIso(),
      grantedFrame: game.currentFrame,
    });
  }
  const extra = outcome as { choiceIds?: string[] };
  if (extra.choiceIds?.length) {
    item.status = "waiting_choice";
    item.choiceIds = extra.choiceIds;
  }
  state.activations.push({
    id: uid("act"),
    inventoryId: item.id,
    modifierId: item.modifierId,
    actorId: args.actorPlayerId,
    targetId: args.targetPlayerId,
    roundId: round.id,
    frame: game.currentFrame,
    payload: args.payload ?? {},
    result: { message: outcome.message, status: outcome.status },
    status: outcome.status,
    createdAt: nowIso(),
  });
  state.seenKeys.push(args.idempotencyKey);
  const def = modifierById(item.modifierId);
  emit(state, t.id, "modifier", outcome.message, { modifierId: def.id, actorId: actorP.id, targetId: args.targetPlayerId });
  audit(state, t.id, args.actorPlayerId, "activate_modifier", `${def.name}: ${outcome.message}`);
  return outcome;
}

export function chooseLegendary(state: EngineState, inventoryId: string, modifierId: string) {
  const item = state.inventory.find((i) => i.id === inventoryId);
  if (!item || item.status !== "waiting_choice") throw new Error("No hay elección pendiente.");
  if (!item.choiceIds?.includes(modifierId)) throw new Error("Esa opción no está disponible.");
  item.modifierId = modifierId;
  item.status = "held";
  item.choiceIds = undefined;
}

function applyPatches(state: EngineState, roundId: string, patches: { playerId: string; delta: number; reason: string }[]) {
  const round = state.rounds.find((r) => r.id === roundId)!;
  const t = mustTournament(state, state.players.find((p) => p.id === patches[0]?.playerId)?.tournamentId ?? guessTid(round));
  const settings = round.modifiersFrozen ?? t.settings.modifiers;
  for (const patch of patches) {
    const game = state.games.find((g) => g.playerId === patch.playerId && g.roundId === roundId);
    if (!game) continue;
    game.bonus = clampBonus(game.bonus + patch.delta, settings);
    refreshGame(game);
  }
}

function guessTid(round: Round) {
  return round.tournamentId;
}

function refreshGame(game: PlayerGame) {
  const s = scoreGame(game.rolls);
  game.official = s.official;
  game.currentFrame = s.currentFrame;
  game.complete = s.complete;
  game.total = totalScore(game.official, game.bonus);
}

function snapshotPlayer(state: EngineState, game: PlayerGame) {
  const ranking = laneRanking(state.games.filter((g) => g.roundId === game.roundId && g.laneId === game.laneId));
  return snapshotFrom(state, game, ranking);
}

function snapshotFrom(
  state: EngineState,
  game: PlayerGame,
  ranking: { playerId: string; place: number }[],
) {
  const player = state.players.find((p) => p.id === game.playerId)!;
  const place = ranking.find((r) => r.playerId === game.playerId)?.place ?? ranking.length;
  return {
    id: player.id,
    teamId: player.teamId,
    laneId: game.laneId,
    official: game.official,
    bonus: game.bonus,
    total: game.total,
    rolls: game.rolls,
    inventory: state.inventory.filter((i) => i.playerId === player.id && i.roundId === game.roundId),
    effects: state.effects.filter((e) => e.playerId === player.id && e.roundId === game.roundId),
    placeInLane: place,
    lastInLane: place === ranking.length && ranking.length > 1,
    leaderInLane: place === 1,
  };
}

export function playerPointsForRound(state: EngineState, tournamentId: string, kind: 1 | 2 | 3) {
  const round = state.rounds.find((r) => r.tournamentId === tournamentId && r.kind === kind);
  if (!round) return [];
  return state.games.filter((g) => g.roundId === round.id).map((g) => ({
    playerId: g.playerId,
    official: g.official,
    bonus: g.bonus,
  }));
}

export function currentTeamRanking(state: EngineState, tournamentId: string) {
  const t = mustTournament(state, tournamentId);
  const players = state.players.filter((p) => p.tournamentId === tournamentId);
  const merged = mergeRounds(
    players,
    [
      { round: 1, points: playerPointsForRound(state, tournamentId, 1) },
      { round: 2, points: playerPointsForRound(state, tournamentId, 2) },
      { round: 3, points: playerPointsForRound(state, tournamentId, 3) },
    ],
    t.settings.scoring,
  );
  return rankTeams(state.teams.filter((x) => x.tournamentId === tournamentId), merged);
}

export function mustTournament(state: EngineState, id: string) {
  const t = state.tournaments.find((x) => x.id === id);
  if (!t) throw new Error("Torneo no encontrado.");
  return t;
}

export function mustRound(state: EngineState, tournamentId: string, kind: 1 | 2 | 3) {
  const r = state.rounds.find((x) => x.tournamentId === tournamentId && x.kind === kind);
  if (!r) throw new Error("Ronda no encontrada.");
  return r;
}

function expandTotalToRolls(total: number): number[] {
  if (total === 300) return Array(12).fill(10);
  const rolls: number[] = [];
  let left = total;
  for (let f = 1; f <= 9; f++) {
    const take = Math.min(9, left);
    rolls.push(take, 0);
    left -= take;
  }
  const last = Math.min(10, left);
  rolls.push(last, 0);
  return applyUntilScore(total);
}

function applyUntilScore(total: number): number[] {
  if (total === 300) return Array(12).fill(10);
  const rolls: number[] = [];
  let remaining = total;
  for (let f = 0; f < 9; f++) {
    const v = Math.min(9, remaining);
    rolls.push(v);
    rolls.push(0);
    remaining -= v;
  }
  rolls.push(Math.min(10, remaining), 0);
  const scored = scoreGame(rolls).official;
  if (scored === total) return rolls;
  return rolls;
}

export function moveAssignment(state: EngineState, assignmentId: string, laneId: string, order: number) {
  const a = state.assignments.find((x) => x.id === assignmentId);
  if (!a) throw new Error("Asignación no encontrada.");
  a.laneId = laneId;
  a.order = order;
  const game = state.games.find((g) => g.playerId === a.playerId && g.roundId === a.roundId);
  if (game && !game.rolls.length) game.laneId = laneId;
}

export function exportCsv(state: EngineState, tournamentId: string): string {
  const t = mustTournament(state, tournamentId);
  const players = state.players.filter((p) => p.tournamentId === tournamentId);
  const teams = state.teams.filter((x) => x.tournamentId === tournamentId);
  const header = "Jugador,Equipo,Oficial R1,Bonus R1,Oficial R2,Bonus R2,Oficial R3,Bonus R3,Puntos torneo";
  const lines = players.map((p) => {
    const team = teams.find((x) => x.id === p.teamId)?.name ?? "";
    const r = [1, 2, 3].map((k) => {
      const round = mustRound(state, tournamentId, k as 1 | 2 | 3);
      const g = state.games.find((x) => x.roundId === round.id && x.playerId === p.id);
      return [g?.official ?? 0, g?.bonus ?? 0];
    });
    const tp =
      roundContribution(r[0][0], r[0][1], 1, t.settings.scoring) +
      roundContribution(r[1][0], r[1][1], 2, t.settings.scoring) +
      roundContribution(r[2][0], r[2][1], 3, t.settings.scoring);
    return [p.displayName, team, r[0][0], r[0][1], r[1][0], r[1][1], r[2][0], r[2][1], tp].join(",");
  });
  return [header, ...lines].join("\n");
}

export { teamSize };
