import { describe, expect, it } from "vitest";
import {
  assignmentFromRow,
  assignmentToRow,
  effectFromRow,
  effectToRow,
  gameFromRow,
  gameToRow,
  inventoryFromRow,
  inventoryToRow,
  playerFromRow,
  playerToRow,
  roundFromRow,
  roundToRow,
  tournamentFromRow,
  tournamentToRow,
} from "./live";
import type { ActiveEffect, InventoryItem, LaneAssignment, Player, PlayerGame, Round, Tournament } from "../domain/types";

const tournament: Tournament = {
  id: "t1",
  name: "Torneo",
  description: "d",
  date: "2026-01-01",
  accessCode: "ABC123",
  status: "registration",
  createdBy: "u1",
  settings: {} as Tournament["settings"],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const round: Round = {
  id: "r1",
  tournamentId: "t1",
  kind: 1,
  status: "live",
  modifiersFrozen: null,
  startedAt: "2026-01-01T00:00:00.000Z",
};

const game: PlayerGame = {
  playerId: "p1",
  roundId: "r1",
  laneId: "l1",
  rolls: [10, 7, 3],
  official: 20,
  bonus: 5,
  total: 25,
  currentFrame: 2,
  complete: false,
  scoreStatus: "confirmed",
  version: 3,
};

const assignment: LaneAssignment = {
  id: "a1",
  roundId: "r1",
  laneId: "l1",
  playerId: "p1",
  order: 2,
};

const inventory: InventoryItem = {
  id: "i1",
  playerId: "p1",
  roundId: "r1",
  modifierId: "gold_coins",
  status: "held",
  grantedAt: "2026-01-01T00:00:00.000Z",
  grantedFrame: 4,
};

const player: Player = {
  id: "p1",
  tournamentId: "t1",
  userId: "u1",
  displayName: "Ada",
  avatar: "🐯",
  teamId: "team1",
  uniqueKey: "secret-local",
  banned: false,
};

const effect: ActiveEffect = {
  id: "e1",
  playerId: "p1",
  roundId: "r1",
  kind: "shield",
  remainingFrames: 3,
  data: { source: "seed" },
};

describe("mapeo motor (camelCase) ↔ Supabase (snake_case)", () => {
  it("tournament renombra access_code / created_by / timestamps", () => {
    const row = tournamentToRow(tournament);
    expect(row.access_code).toBe("ABC123");
    expect(row.created_by).toBe("u1");
    expect(row.created_at).toBe(tournament.createdAt);
    expect(row.accessCode).toBeUndefined();
    expect(tournamentFromRow(row)).toEqual(tournament);
  });

  it("round renombra modifiers_frozen y started_at", () => {
    const row = roundToRow(round);
    expect(row.modifiers_frozen).toBeNull();
    expect(row.started_at).toBe(round.startedAt);
    expect(roundFromRow(row)).toEqual(round);
  });

  it("game renombra current_frame, score_status y las FKs a *_id", () => {
    const row = gameToRow(game);
    expect(row.current_frame).toBe(2);
    expect(row.score_status).toBe("confirmed");
    expect(row.round_id).toBe(game.roundId);
    expect(row.player_id).toBe(game.playerId);
    expect(row.lane_id).toBe(game.laneId);
    expect(gameFromRow(row)).toEqual(game);
  });

  it("assignment renombra order → sort_order y las FKs a *_id", () => {
    const row = assignmentToRow(assignment);
    expect(row.sort_order).toBe(2);
    expect(row.round_id).toBe(assignment.roundId);
    expect(row.lane_id).toBe(assignment.laneId);
    expect(row.player_id).toBe(assignment.playerId);
    expect(row.order).toBeUndefined();
    expect(assignmentFromRow(row)).toEqual(assignment);
  });

  it("inventory renombra granted_frame y las FKs a *_id", () => {
    const row = inventoryToRow(inventory);
    expect(row.granted_frame).toBe(4);
    expect(row.granted_at).toBe(inventory.grantedAt);
    expect(row.player_id).toBe(inventory.playerId);
    expect(row.round_id).toBe(inventory.roundId);
    expect(row.modifier_id).toBe(inventory.modifierId);
    expect(inventoryFromRow(row)).toEqual(inventory);
  });

  it("player descarta uniqueKey al subir y lo deriva de user_id al bajar; mapea displayName", () => {
    const row = playerToRow(player);
    expect(row.uniqueKey).toBeUndefined();
    expect(row.user_id).toBe("u1");
    expect(row.display_name).toBe("Ada");
    expect(row.displayName).toBeUndefined();
    const back = playerFromRow(row);
    expect(back.userId).toBe("u1");
    expect(back.displayName).toBe("Ada");
    expect(back.uniqueKey).toBe("u1");
  });

  it("effect renombra remaining_frames y las FKs a *_id", () => {
    const row = effectToRow(effect);
    expect(row.remaining_frames).toBe(3);
    expect(row.player_id).toBe(effect.playerId);
    expect(row.round_id).toBe(effect.roundId);
    expect(effectFromRow(row)).toEqual(effect);
  });
});
