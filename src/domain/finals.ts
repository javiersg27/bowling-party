import type { Lane, Player, ScoringSettings, Team } from "./types";
import { autoSpreadPlayers } from "./assignment";
import type { RankedTeam } from "./rankings";

export interface FinalPlan {
  upper: string[];
  lower: string[];
  note: string;
  matchups: { group: "upper" | "lower"; teamA: string; teamB?: string; laneId?: string }[];
  assignments: { playerId: string; laneId: string; order: number }[];
  warnings: string[];
}

/**
 * Divide equipos en grupo superior e inferior.
 * Si el recuento es impar, el grupo superior recibe el equipo extra
 * para que el campeón siempre salga de esa mitad (criterio documentado).
 * El ganador del grupo inferior nunca puede adelantar al campeón del superior
 * en la clasificación final: las posiciones 1..U se reservan al grupo upper.
 */
export function splitFinalGroups(rankedTeams: RankedTeam[], settings: ScoringSettings): {
  upper: RankedTeam[];
  lower: RankedTeam[];
  note: string;
} {
  const n = rankedTeams.length;
  if (n === 0) return { upper: [], lower: [], note: "No hay equipos." };
  let upperCount = settings.upperGroupSize ?? Math.ceil(n / 2);
  upperCount = Math.max(1, Math.min(n, upperCount));
  if (n % 2 === 1 && settings.upperGroupSize == null) {
    upperCount = Math.ceil(n / 2);
  }
  const upper = rankedTeams.slice(0, upperCount);
  const lower = rankedTeams.slice(upperCount);
  return {
    upper,
    lower,
    note:
      n % 2 === 1
        ? `Hay ${n} equipos (impar): el grupo superior recibe ${upperCount} equipos y el inferior ${lower.length}. El campeón sale siempre del grupo superior.`
        : `Grupo superior: ${upperCount} equipos. Grupo inferior: ${lower.length} equipos.`,
  };
}

export function buildFinalPlan(args: {
  rankedTeams: RankedTeam[];
  teams: Team[];
  players: Player[];
  lanes: Lane[];
  playersPerLane: number;
  settings: ScoringSettings;
}): FinalPlan {
  const { upper, lower, note } = splitFinalGroups(args.rankedTeams, args.settings);
  const upperLanes = args.lanes.filter((_, i) => i < Math.ceil(args.lanes.length / 2) || args.lanes.length === 1);
  const lowerLanes =
    args.lanes.length === 1
      ? args.lanes
      : args.lanes.filter((l) => !upperLanes.includes(l)).length
        ? args.lanes.filter((l) => !upperLanes.includes(l))
        : args.lanes.slice(Math.floor(args.lanes.length / 2));

  const matchups: FinalPlan["matchups"] = [];
  const pair = (group: "upper" | "lower", list: RankedTeam[], lanePool: Lane[]) => {
    for (let i = 0; i < list.length; i += 2) {
      const a = list[i];
      const b = list[i + 1];
      matchups.push({
        group,
        teamA: a.teamId,
        teamB: b?.teamId,
        laneId: lanePool[Math.floor(i / 2) % lanePool.length]?.id,
      });
    }
  };
  pair("upper", upper, upperLanes.length ? upperLanes : args.lanes);
  pair("lower", lower, lowerLanes.length ? lowerLanes : args.lanes);

  const assignGroup = (groupTeams: RankedTeam[], lanePool: Lane[]) => {
    const teamIds = new Set(groupTeams.map((t) => t.teamId));
    const players = args.players.filter((p) => teamIds.has(p.teamId) && !p.banned);
    const teams = args.teams.filter((t) => teamIds.has(t.id));
    const lanes = lanePool.length ? lanePool : args.lanes;
    return autoSpreadPlayers({
      players,
      teams,
      lanes,
      playersPerLane: args.playersPerLane,
    });
  };

  const up = assignGroup(upper, upperLanes.length ? upperLanes : args.lanes);
  const low = assignGroup(lower, lowerLanes.length ? lowerLanes : args.lanes);

  return {
    upper: upper.map((t) => t.teamId),
    lower: lower.map((t) => t.teamId),
    note,
    matchups,
    assignments: [...(up.placements ?? []), ...(low.placements ?? [])],
    warnings: [...up.warnings, ...low.warnings, !up.ok ? up.reason ?? "" : "", !low.ok ? low.reason ?? "" : ""].filter(Boolean),
  };
}

export function lockFinalStandings(args: {
  upperTeamIds: string[];
  lowerTeamIds: string[];
  round3TeamOrder: { teamId: string; points: number; previous: number }[];
}): { teamId: string; finalPlace: number; group: "upper" | "lower" }[] {
  const upper = args.round3TeamOrder
    .filter((t) => args.upperTeamIds.includes(t.teamId))
    .sort((a, b) => b.points - a.points || b.previous - a.previous);
  const lower = args.round3TeamOrder
    .filter((t) => args.lowerTeamIds.includes(t.teamId))
    .sort((a, b) => b.points - a.points || b.previous - a.previous);
  return [
    ...upper.map((t, i) => ({ teamId: t.teamId, finalPlace: i + 1, group: "upper" as const })),
    ...lower.map((t, i) => ({
      teamId: t.teamId,
      finalPlace: upper.length + i + 1,
      group: "lower" as const,
    })),
  ];
}
