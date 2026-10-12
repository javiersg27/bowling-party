import type { Player, ScoringSettings, Team } from "./types";
import { totalScore } from "./modifiers";

export interface RoundPoints {
  playerId: string;
  official: number;
  bonus: number;
}

export interface RankedPlayer {
  playerId: string;
  displayName: string;
  teamId: string;
  official: number;
  bonus: number;
  total: number;
  tournamentPoints: number;
  place: number;
}

export interface RankedTeam {
  teamId: string;
  name: string;
  color: string;
  official: number;
  bonus: number;
  total: number;
  tournamentPoints: number;
  place: number;
}

export function roundContribution(
  official: number,
  bonus: number,
  round: 1 | 2 | 3,
  settings: ScoringSettings,
): number {
  const useBonus =
    (round === 1 && settings.round1UsesBonus) ||
    (round === 2 && settings.round2UsesBonus) ||
    (round === 3 && settings.round3UsesBonus);
  const raw = useBonus ? totalScore(official, bonus) : official;
  if (round === 1 && !settings.countWarmupRound) return 0;
  return raw;
}

export function rankPlayers(
  players: Player[],
  points: RoundPoints[],
  stableOrder: string[],
): RankedPlayer[] {
  const map = new Map(points.map((p) => [p.playerId, p]));
  const rows: RankedPlayer[] = players
    .filter((p) => !p.banned)
    .map((p) => {
      const pts = map.get(p.id) ?? { official: 0, bonus: 0, playerId: p.id };
      const total = totalScore(pts.official, pts.bonus);
      return {
        playerId: p.id,
        displayName: p.displayName,
        teamId: p.teamId,
        official: pts.official,
        bonus: pts.bonus,
        total,
        tournamentPoints: total,
        place: 0,
      };
    });
  rows.sort((a, b) => {
    if (b.total !== a.total) return b.total - a.total;
    if (b.official !== a.official) return b.official - a.official;
    const ia = stableOrder.indexOf(a.playerId);
    const ib = stableOrder.indexOf(b.playerId);
    return ia - ib;
  });
  rows.forEach((r, i) => {
    r.place = i + 1;
  });
  return rows;
}

export function rankTeams(
  teams: Team[],
  players: RankedPlayer[],
): RankedTeam[] {
  const rows = teams.map((team) => {
    const members = players.filter((p) => p.teamId === team.id);
    const official = members.reduce((s, m) => s + m.official, 0);
    const bonus = members.reduce((s, m) => s + m.bonus, 0);
    const tournamentPoints = members.reduce((s, m) => s + m.tournamentPoints, 0);
    return {
      teamId: team.id,
      name: team.name,
      color: team.color,
      official,
      bonus,
      total: members.reduce((s, m) => s + m.total, 0),
      tournamentPoints,
      place: 0,
    };
  });
  rows.sort((a, b) => {
    if (b.tournamentPoints !== a.tournamentPoints) return b.tournamentPoints - a.tournamentPoints;
    if (b.official !== a.official) return b.official - a.official;
    return a.name.localeCompare(b.name, "es");
  });
  rows.forEach((r, i) => {
    r.place = i + 1;
  });
  return rows;
}

export function mergeRounds(
  players: Player[],
  byRound: { round: 1 | 2 | 3; points: RoundPoints[] }[],
  settings: ScoringSettings,
): RankedPlayer[] {
  const acc = new Map<string, { official: number; bonus: number; tournament: number }>();
  for (const p of players) acc.set(p.id, { official: 0, bonus: 0, tournament: 0 });
  for (const block of byRound) {
    for (const row of block.points) {
      const cur = acc.get(row.playerId);
      if (!cur) continue;
      cur.official += row.official;
      cur.bonus += row.bonus;
      cur.tournament += roundContribution(row.official, row.bonus, block.round, settings);
    }
  }
  const fakePoints = [...acc.entries()].map(([playerId, v]) => ({
    playerId,
    official: v.tournament,
    bonus: 0,
  }));
  const ranked = rankPlayers(players, fakePoints, players.map((p) => p.id));
  return ranked.map((r) => {
    const v = acc.get(r.playerId)!;
    return {
      ...r,
      official: v.official,
      bonus: v.bonus,
      total: totalScore(v.official, v.bonus),
      tournamentPoints: v.tournament,
    };
  }).sort((a, b) => {
    if (b.tournamentPoints !== a.tournamentPoints) return b.tournamentPoints - a.tournamentPoints;
    if (b.official !== a.official) return b.official - a.official;
    return a.displayName.localeCompare(b.displayName, "es");
  }).map((r, i) => ({ ...r, place: i + 1 }));
}
