import { describe, expect, it } from "vitest";
import { mergeBundle, mergeRemoteState, type JoinBundle, type RemoteState } from "./hydrate";
import { emptyState } from "./engine";
import type { Player, PlayerGame, Team, Tournament } from "../domain/types";

function tournament(id: string, accessCode: string, name = id, updatedAt = "2026-01-01T00:00:00.000Z"): Tournament {
  return {
    id,
    name,
    description: "",
    date: "2026-01-01",
    accessCode,
    status: "registration",
    createdBy: "u1",
    settings: {} as Tournament["settings"],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt,
  };
}

function team(id: string, tournamentId: string, name = id): Team {
  return { id, tournamentId, name, color: "#000", accent: "#fff", sortOrder: 0 };
}

describe("mergeBundle (hidratación 6.B)", () => {
  it("añade un torneo y sus equipos sin tocar el resto", () => {
    const state = emptyState();
    const bundle: JoinBundle = {
      tournament: tournament("tR", "CODE12"),
      teams: [team("aR", "tR"), team("bR", "tR")],
    };
    const merged = mergeBundle(state, bundle);
    expect(merged.tournaments.map((t) => t.id)).toEqual(["tR"]);
    expect(merged.teams.map((t) => t.id).sort()).toEqual(["aR", "bR"]);
    expect(merged.players).toEqual([]);
    expect(merged.rounds).toEqual([]);
  });

  it("es no destructivo: conserva lo local y añade lo remoto", () => {
    const state = emptyState();
    state.tournaments.push(tournament("local1", "LOCAL1"));
    const merged = mergeBundle(state, { tournament: tournament("tR", "CODE12"), teams: [] });
    expect(merged.tournaments.map((t) => t.id).sort()).toEqual(["local1", "tR"]);
    // el estado original no se muta (merge puro)
    expect(state.tournaments.map((t) => t.id)).toEqual(["local1"]);
  });

  it("en conflicto de id gana el remoto", () => {
    const state = emptyState();
    state.tournaments.push(tournament("t1", "OLD111", "Nombre local"));
    const merged = mergeBundle(state, {
      tournament: tournament("t1", "NEW111", "Nombre nube"),
      teams: [],
    });
    const t = merged.tournaments.find((x) => x.id === "t1")!;
    expect(t.accessCode).toBe("NEW111");
    expect(t.name).toBe("Nombre nube");
  });

  it("los equipos se fusionan por id (remoto gana, nuevos se añaden)", () => {
    const state = emptyState();
    state.teams.push(team("x", "tR", "Local"));
    const merged = mergeBundle(state, {
      tournament: tournament("tR", "CODE12"),
      teams: [team("x", "tR", "Nube"), team("y", "tR")],
    });
    expect(merged.teams.find((t) => t.id === "x")!.name).toBe("Nube");
    expect(merged.teams.map((t) => t.id).sort()).toEqual(["x", "y"]);
  });

  it("bundle vacío de equipos no altera los equipos existentes", () => {
    const state = emptyState();
    state.teams.push(team("x", "tR", "Local"));
    const merged = mergeBundle(state, { tournament: tournament("tR", "CODE12"), teams: [] });
    expect(merged.teams.map((t) => t.id)).toEqual(["x"]);
  });
});

describe("mergeRemoteState (pull del host)", () => {
  function player(id: string, name: string): Player {
    return {
      id,
      tournamentId: "t1",
      userId: `u-${id}`,
      displayName: name,
      avatar: "🎳",
      teamId: "team1",
      uniqueKey: `t1:${name.toLowerCase()}`,
      banned: false,
    };
  }

  function game(playerId: string, total: number): PlayerGame {
    return {
      playerId,
      roundId: "r1",
      laneId: "l1",
      rolls: [],
      official: total,
      bonus: 0,
      total,
      currentFrame: 1,
      complete: false,
      scoreStatus: "pending",
      version: 0,
    };
  }

  function remote(over: Partial<RemoteState> = {}): RemoteState {
    return {
      tournament: null,
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
      ...over,
    };
  }

  it("añade jugadores remotos sin destruir los locales (host ve al del móvil)", () => {
    const state = emptyState();
    state.players.push(player("p-local", "Host"));
    const merged = mergeRemoteState(state, remote({ players: [player("p-mobile", "Movil")] }));
    expect(merged.players.map((p) => p.id).sort()).toEqual(["p-local", "p-mobile"]);
    // El estado original no se muta (merge puro).
    expect(state.players.map((p) => p.id)).toEqual(["p-local"]);
  });

  it("en un mismo id gana el remoto (remote wins)", () => {
    const state = emptyState();
    state.players.push(player("p1", "NombreViejo"));
    const merged = mergeRemoteState(state, remote({ players: [player("p1", "NombreNuevo")] }));
    expect(merged.players.find((p) => p.id === "p1")!.displayName).toBe("NombreNuevo");
  });

  it("reconcilia games por su clave natural (playerId, roundId)", () => {
    const state = emptyState();
    state.games.push(game("p1", 10));
    const merged = mergeRemoteState(
      state,
      remote({ games: [game("p1", 99), game("p2", 50)] }),
    );
    const g1 = merged.games.find((g) => g.playerId === "p1")!;
    const g2 = merged.games.find((g) => g.playerId === "p2")!;
    expect(g1.total).toBe(99); // remoto gana con mismas versiones
    expect(g2.total).toBe(50); // nuevo se añade
    expect(merged.games).toHaveLength(2);
  });

  it("conserva el juego local si tiene mayor versión o más tiradas (evita reset a 0)", () => {
    const state = emptyState();
    // Jugador tira en el móvil: total 7, version 1, rolls [7]
    state.games.push({
      ...game("p1", 7),
      version: 1,
      rolls: [7],
    });
    // Llega pull de Supabase antes de sincronizar (versión vieja 0, sin tiradas)
    const staleRemote = remote({
      games: [{ ...game("p1", 0), version: 0, rolls: [] }],
    });
    const merged = mergeRemoteState(state, staleRemote);
    const g = merged.games.find((x) => x.playerId === "p1")!;
    expect(g.total).toBe(7);
    expect(g.version).toBe(1);
    expect(g.rolls).toEqual([7]);
  });

  it("torneo: gana el de updatedAt más reciente (no pisa cambios locales nuevos)", () => {
    const state = emptyState();
    state.tournaments.push(tournament("t1", "NEW111", "Local mas nuevo", "2026-02-01T00:00:00.000Z"));
    // Remoto más antiguo → se conserva el local.
    const mergedOld = mergeRemoteState(state, remote({ tournament: tournament("t1", "OLD111", "Nube vieja", "2026-01-01T00:00:00.000Z") }));
    expect(mergedOld.tournaments[0].name).toBe("Local mas nuevo");
    // Remoto más reciente → gana la nube.
    const mergedNew = mergeRemoteState(state, remote({ tournament: tournament("t1", "NEW222", "Nube nueva", "2026-03-01T00:00:00.000Z") }));
    expect(mergedNew.tournaments[0].name).toBe("Nube nueva");
  });

  it("añade el torneo remoto si no existía en local", () => {
    const state = emptyState();
    const merged = mergeRemoteState(state, remote({ tournament: tournament("t1", "ABC123", "Desde la nube") }));
    expect(merged.tournaments.map((t) => t.id)).toEqual(["t1"]);
  });
});
