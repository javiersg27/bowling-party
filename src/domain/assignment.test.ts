import { describe, expect, it } from "vitest";
import { autoSpreadPlayers } from "./assignment";
import { lockFinalStandings, splitFinalGroups } from "./finals";
import { rankTeams } from "./rankings";
import { DEFAULT_SCORING, type Lane, type Player, type Team } from "./types";

function team(i: number): Team {
  return { id: `t${i}`, tournamentId: "x", name: `E${i}`, color: "#000", accent: "#fff", sortOrder: i };
}
function player(id: string, teamId: string): Player {
  return { id, tournamentId: "x", userId: id, displayName: id, avatar: "🎳", teamId, uniqueKey: id, banned: false };
}
function lane(n: number): Lane {
  return { id: `l${n}`, tournamentId: "x", name: `P${n}`, number: n };
}

describe("asignación de pistas", () => {
  it("reparte compañeros en pistas distintas", () => {
    const teams = [team(1), team(2), team(3)];
    const players = [
      player("javi", "t1"),
      player("carlos", "t1"),
      player("pablo", "t1"),
      player("marta", "t2"),
      player("lucia", "t2"),
      player("paula", "t2"),
      player("sergio", "t3"),
      player("ana", "t3"),
      player("david", "t3"),
    ];
    const lanes = [lane(1), lane(2), lane(3)];
    const r = autoSpreadPlayers({ players, teams, lanes, playersPerLane: 3 });
    expect(r.ok).toBe(true);
    for (const teamId of ["t1", "t2", "t3"]) {
      const seats = r.placements.filter((p) => players.find((x) => x.id === p.playerId)?.teamId === teamId).map((p) => p.laneId);
      expect(new Set(seats).size).toBe(3);
    }
  });

  it("explica capacidad insuficiente", () => {
    const r = autoSpreadPlayers({
      players: [player("a", "t1"), player("b", "t1"), player("c", "t1")],
      teams: [team(1)],
      lanes: [lane(1)],
      playersPerLane: 2,
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/plazas/);
  });
});

describe("finales", () => {
  it("grupo inferior no adelanta al campeón", () => {
    const ranked = rankTeams(
      [team(1), team(2), team(3), team(4)],
      [
        { playerId: "1", displayName: "1", teamId: "t1", official: 100, bonus: 0, total: 100, tournamentPoints: 200, place: 1 },
        { playerId: "2", displayName: "2", teamId: "t2", official: 90, bonus: 0, total: 90, tournamentPoints: 180, place: 2 },
        { playerId: "3", displayName: "3", teamId: "t3", official: 80, bonus: 0, total: 80, tournamentPoints: 100, place: 3 },
        { playerId: "4", displayName: "4", teamId: "t4", official: 70, bonus: 0, total: 70, tournamentPoints: 90, place: 4 },
      ],
    );
    const g = splitFinalGroups(ranked, DEFAULT_SCORING);
    expect(g.upper).toHaveLength(2);
    const locked = lockFinalStandings({
      upperTeamIds: g.upper.map((x) => x.teamId),
      lowerTeamIds: g.lower.map((x) => x.teamId),
      round3TeamOrder: [
        { teamId: "t1", points: 10, previous: 200 },
        { teamId: "t2", points: 80, previous: 180 },
        { teamId: "t3", points: 300, previous: 100 },
        { teamId: "t4", points: 290, previous: 90 },
      ],
    });
    expect(locked.find((x) => x.finalPlace === 1)?.group).toBe("upper");
    expect(locked.find((x) => x.teamId === "t3")!.finalPlace).toBeGreaterThan(2);
  });

  it("impar: extra al grupo superior", () => {
    const ranked = [1, 2, 3].map((i) => ({
      teamId: `t${i}`,
      name: `E${i}`,
      color: "#000",
      official: 10,
      bonus: 0,
      total: 10,
      tournamentPoints: 30 - i,
      place: i,
    }));
    const g = splitFinalGroups(ranked, DEFAULT_SCORING);
    expect(g.upper.length).toBe(2);
    expect(g.lower.length).toBe(1);
  });
});
