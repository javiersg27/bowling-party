import type { Lane, Player, Team } from "./types";

export interface AssignmentResult {
  ok: boolean;
  reason?: string;
  warnings: string[];
  placements: { playerId: string; laneId: string; order: number }[];
}

export function balanceWarnings(players: Player[], teams: Team[], maxPerTeam: number): string[] {
  const warnings: string[] = [];
  const counts = teams.map((t) => ({
    team: t,
    n: players.filter((p) => p.teamId === t.id && !p.banned).length,
  }));
  const sizes = counts.map((c) => c.n);
  if (!sizes.length) return ["Todavía no hay jugadores inscritos."];
  const max = Math.max(...sizes);
  const min = Math.min(...sizes);
  if (max - min >= 2) {
    warnings.push(
      `Los equipos están desequilibrados (${counts.map((c) => `${c.team.name}: ${c.n}`).join(", ")}). El resultado competitivo puede sesgarse.`,
    );
  }
  for (const c of counts) {
    if (c.n > maxPerTeam) {
      warnings.push(`${c.team.name} supera el máximo de ${maxPerTeam} jugadores.`);
    }
  }
  return warnings;
}

/**
 * Reparte a los miembros de cada equipo entre pistas distintas (round-robin greedy).
 * Prioriza: (1) no saturar una pista, (2) no concentrar compañeros de equipo.
 */
export function autoSpreadPlayers(args: {
  players: Player[];
  teams: Team[];
  lanes: Lane[];
  playersPerLane: number;
}): AssignmentResult {
  const { players, teams, lanes, playersPerLane } = args;
  const active = players.filter((p) => !p.banned);
  const warnings = balanceWarnings(active, teams, 99);
  if (!lanes.length) return { ok: false, reason: "No hay pistas configuradas.", warnings, placements: [] };
  if (!active.length) return { ok: false, reason: "No hay jugadores para asignar.", warnings, placements: [] };

  const capacity = lanes.length * playersPerLane;
  if (active.length > capacity) {
    return {
      ok: false,
      reason: `Hay ${active.length} jugadores y solo ${capacity} plazas (${lanes.length} pistas × ${playersPerLane}). Aumenta pistas o el máximo por pista.`,
      warnings,
      placements: [],
    };
  }

  const minNeeded = Math.ceil(active.length / playersPerLane);
  if (lanes.length < minNeeded && playersPerLane < active.length) {
    warnings.push(`Con ${active.length} jugadores harían falta al menos ${minNeeded} pistas para no superar ${playersPerLane} por pista.`);
  }

  const laneLoads = lanes.map((lane) => ({
    lane,
    players: [] as Player[],
    teamCounts: new Map<string, number>(),
  }));

  const byTeam = teams
    .map((team) => ({
      team,
      members: shuffleStable(
        active.filter((p) => p.teamId === team.id),
        team.id,
      ),
    }))
    .sort((a, b) => b.members.length - a.members.length);

  const leftovers = active.filter((p) => !teams.some((t) => t.id === p.teamId));

  const place = (player: Player) => {
    const candidates = [...laneLoads].sort((a, b) => {
      const capA = a.players.length - playersPerLane;
      const capB = b.players.length - playersPerLane;
      if (capA >= 0 && capB < 0) return 1;
      if (capB >= 0 && capA < 0) return -1;
      const teamA = a.teamCounts.get(player.teamId) ?? 0;
      const teamB = b.teamCounts.get(player.teamId) ?? 0;
      if (teamA !== teamB) return teamA - teamB;
      if (a.players.length !== b.players.length) return a.players.length - b.players.length;
      return a.lane.number - b.lane.number;
    });
    const chosen = candidates[0];
    chosen.players.push(player);
    chosen.teamCounts.set(player.teamId, (chosen.teamCounts.get(player.teamId) ?? 0) + 1);
  };

  for (const group of byTeam) {
    for (const member of group.members) place(member);
  }
  for (const extra of leftovers) place(extra);

  const overflow = laneLoads.filter((l) => l.players.length > playersPerLane);
  if (overflow.length) {
    return {
      ok: false,
      reason: `No es posible respetar ${playersPerLane} jugadores por pista. ${overflow
        .map((l) => `${l.lane.name} quedaría con ${l.players.length}`)
        .join("; ")}.`,
      warnings,
      placements: [],
    };
  }

  const mixed = laneLoads.some((l) => new Set(l.players.map((p) => p.teamId)).size < Math.min(2, l.players.length) && l.players.length > 1);
  if (!mixed && teams.length > 1 && active.length > lanes.length) {
    warnings.push("Algunas pistas podrían quedar con poca mezcla de equipos. Puedes reorganizarlas a mano.");
  }

  for (const load of laneLoads) {
    const concentrated = [...load.teamCounts.values()].some((n) => n > 1 && load.players.length > 1);
    const uniqueTeams = load.teamCounts.size;
    if (concentrated && uniqueTeams === 1 && teams.length > 1) {
      warnings.push(`${load.lane.name} tiene varios jugadores del mismo equipo juntos. El algoritmo no pudo separarlos más.`);
    }
  }

  const placements = laneLoads.flatMap((load) =>
    load.players.map((player, order) => ({
      playerId: player.id,
      laneId: load.lane.id,
      order,
    })),
  );

  return { ok: true, warnings, placements };
}

function shuffleStable<T>(items: T[], seed: string): T[] {
  const copy = [...items];
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  for (let i = copy.length - 1; i > 0; i--) {
    h = Math.imul(h ^ i, 16777619);
    const j = Math.abs(h) % (i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function describeAssignment(result: AssignmentResult, players: Player[], teams: Team[], lanes: Lane[]): string {
  if (!result.ok) return result.reason ?? "Asignación imposible.";
  const lines = lanes.map((lane) => {
    const seated = result.placements
      .filter((p) => p.laneId === lane.id)
      .sort((a, b) => a.order - b.order)
      .map((p) => {
        const player = players.find((x) => x.id === p.playerId);
        const team = teams.find((t) => t.id === player?.teamId);
        return `${player?.displayName ?? "?"} (${team?.name ?? "?"})`;
      });
    return `${lane.name}: ${seated.join(", ") || "vacía"}`;
  });
  return lines.join("\n");
}
