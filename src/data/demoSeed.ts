import { applyRoll } from "../domain/bowling";
import { AVATARS, DEFAULT_MODIFIER_SETTINGS } from "../domain/types";
import {
  activateModifier,
  createTournament,
  distributeLanes,
  emptyState,
  joinTournament,
  recordRoll,
  setStatus,
  startRound,
  type EngineState,
} from "./engine";

const NAMES = [
  ["Javier", 0],
  ["Carlos", 0],
  ["Pablo", 0],
  ["Marta", 1],
  ["Lucía", 1],
  ["Paula", 1],
  ["Sergio", 2],
  ["Ana", 2],
  ["David", 2],
  ["Nerea", 3],
  ["Hugo", 3],
  ["Lara", 3],
] as const;

export const DEMO_ADMIN = { id: "demo-admin", name: "Director Party" };

export function buildDemoState(): EngineState {
  const state = emptyState();
  const t = createTournament(state, {
    name: "Bowling Party Demo",
    description: "Torneo de demostración aislado. Estos resultados NO son un evento real.",
    date: new Date().toISOString().slice(0, 10),
    createdBy: DEMO_ADMIN.id,
    settings: {
      laneCount: 3,
      teamCount: 4,
      playersPerLane: 4,
      maxPlayersPerTeam: 3,
      modifiers: { ...DEFAULT_MODIFIER_SETTINGS, enabledIds: DEFAULT_MODIFIER_SETTINGS.enabledIds },
    },
  });
  t.settings.modifiers.enabledIds = t.settings.modifiers.enabledIds.length
    ? t.settings.modifiers.enabledIds
    : (awaitCatalog());
  if (!t.settings.modifiers.enabledIds.length) {
    t.settings.modifiers.enabledIds = [
      "gold_coins",
      "turbo",
      "shield",
      "hex",
      "superstrike",
      "chasing_shell",
      "impossible_comeback",
      "coin_steal",
      "pin_storm",
      "invincible_star",
    ];
  }
  setStatus(state, t.id, "registration", DEMO_ADMIN.id);
  const teams = state.teams.filter((x) => x.tournamentId === t.id);
  NAMES.forEach(([name, teamIndex], i) => {
    joinTournament(state, {
      code: t.accessCode,
      userId: `demo-user-${i}`,
      displayName: name,
      avatar: AVATARS[i % AVATARS.length],
      teamId: teams[teamIndex].id,
    });
  });
  setStatus(state, t.id, "ready", DEMO_ADMIN.id);
  startRound(state, t.id, DEMO_ADMIN.id);
  const round1 = state.rounds.find((r) => r.tournamentId === t.id && r.kind === 1)!;
  const games = state.games.filter((g) => g.roundId === round1.id);
  const patterns: number[][] = [
    [10, 7, 2, 9, 1, 10, 8, 1, 6, 3, 10, 9, 0, 8, 2, 10, 10, 8],
    [6, 2, 5, 4, 8, 1, 7, 2, 9, 0, 4, 4, 10, 5, 3, 6, 2, 8, 1, 7],
    [9, 0, 10, 6, 3, 8, 2, 7, 1, 5, 4, 10, 9, 1, 8, 0, 7, 2, 6, 3],
    [4, 5, 3, 6, 10, 2, 7, 8, 1, 9, 0, 5, 5, 4, 3, 7, 2, 6, 3, 8],
    [10, 10, 9, 0, 8, 1, 7, 2, 6, 3, 5, 4, 10, 8, 1, 9, 0, 7, 2],
    [5, 3, 6, 2, 7, 1, 8, 0, 9, 0, 4, 4, 3, 5, 2, 6, 1, 7, 8, 1],
    [0, 8, 9, 1, 10, 6, 2, 5, 4, 7, 2, 8, 1, 4, 5, 3, 6, 2, 7, 2],
    [8, 1, 7, 2, 10, 9, 0, 6, 3, 5, 4, 8, 1, 7, 2, 9, 0, 10, 8, 1],
    [3, 4, 5, 2, 6, 3, 7, 1, 8, 0, 4, 3, 5, 4, 6, 2, 7, 1, 8, 1],
    [10, 9, 1, 8, 2, 7, 3, 10, 6, 2, 5, 4, 9, 0, 8, 1, 7, 2, 6],
    [2, 5, 4, 4, 6, 2, 7, 1, 8, 1, 5, 3, 4, 5, 3, 6, 2, 7, 1, 8],
    [9, 1, 10, 10, 8, 1, 7, 2, 6, 3, 5, 5, 4, 4, 9, 0, 8, 1, 7, 2],
  ];
  games.forEach((g, idx) => {
    const seq = patterns[idx % patterns.length];
    for (const pins of seq) {
      try {
        recordRoll(state, {
          playerId: g.playerId,
          roundId: g.roundId,
          pins,
          actorId: DEMO_ADMIN.id,
          expectedVersion: state.games.find((x) => x.playerId === g.playerId && x.roundId === g.roundId)!.version,
          idempotencyKey: `seed-${g.playerId}-${pins}-${state.games.find((x) => x.playerId === g.playerId)!.version}`,
        });
      } catch {
        break;
      }
    }
  });
  const javier = state.players.find((p) => p.displayName === "Javier");
  const item = state.inventory.find((i) => i.playerId === javier?.id && i.status === "held");
  const marta = state.players.find((p) => p.displayName === "Marta");
  if (item && javier && marta) {
    try {
      activateModifier(state, {
        inventoryId: item.id,
        actorPlayerId: javier.id,
        targetPlayerId: marta.id,
        payload: { consent: true },
        idempotencyKey: "seed-activate-1",
      });
    } catch {
      /* objeto puede no requerir objetivo */
    }
  }
  void applyRoll;
  void distributeLanes;
  t.name = "Bowling Party Demo";
  return state;
}

function awaitCatalog() {
  return [
    "gold_coins",
    "turbo",
    "shield",
    "hex",
    "superstrike",
    "chasing_shell",
    "impossible_comeback",
    "coin_steal",
    "pin_storm",
    "invincible_star",
    "shared_luck",
    "freeze",
    "x3",
    "legendary_roulette",
    "score_swap",
  ];
}
