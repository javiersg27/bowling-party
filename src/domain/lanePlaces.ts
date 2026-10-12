import type { PlayerGame } from "./types";

export function laneRanking(games: PlayerGame[]): { playerId: string; place: number; total: number }[] {
  const sorted = [...games].sort((a, b) => {
    if (b.total !== a.total) return b.total - a.total;
    if (b.official !== a.official) return b.official - a.official;
    if (a.rolls.length !== b.rolls.length) return b.rolls.length - a.rolls.length;
    return a.playerId.localeCompare(b.playerId);
  });
  return sorted.map((g, i) => ({ playerId: g.playerId, place: i + 1, total: g.total }));
}
