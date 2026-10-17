import { scoreGame } from "./bowling";
import type { LaneAssignment, PlayerGame } from "./types";

/**
 * Devuelve el `playerId` del jugador al que le toca tirar en esta pista,
 * o `null` si todos han completado la partida.
 *
 * Reglas:
 * 1. Avanzamos frame a frame: todos los jugadores deben completar el frame N
 *    antes de que alguien empiece el frame N+1.
 * 2. Dentro de un frame, el turno va por `assignment.order` ascendente.
 * 3. Un strike cierra el frame de ese jugador en la misma tirada
 *    (solo una tirada), así que el siguiente jugador pasa a tirar al momento.
 * 4. En el frame 10 cada jugador agota sus tiradas de bonificación antes de
 *    ceder el turno.
 */
export function currentTurnPlayerId(
  games: PlayerGame[],
  assignments: LaneAssignment[],
  laneId: string,
  roundId: string,
): string | null {
  // Sólo los juegos de esta pista y ronda, no completados.
  const laneGames = games.filter((g) => g.roundId === roundId && g.laneId === laneId);
  if (!laneGames.length) return null;

  // Construimos mapa playerId → scored y → order
  const scored = new Map(laneGames.map((g) => [g.playerId, scoreGame(g.rolls)]));
  const orderMap = new Map(
    assignments
      .filter((a) => a.roundId === roundId && a.laneId === laneId)
      .map((a) => [a.playerId, a.order]),
  );

  // Jugadores incompletos ordenados por order
  const active = laneGames
    .filter((g) => !g.complete)
    .sort((a, b) => (orderMap.get(a.playerId) ?? 999) - (orderMap.get(b.playerId) ?? 999));

  if (!active.length) return null;

  // El frame mínimo entre todos los jugadores activos: todos deben completarlo
  // antes de avanzar al siguiente.
  const minFrame = Math.min(...active.map((g) => scored.get(g.playerId)!.currentFrame));

  // Entre los jugadores en el frame mínimo, buscamos el primero (por order)
  // que todavía tiene tiradas pendientes en ese frame.
  const candidates = active.filter((g) => {
    const s = scored.get(g.playerId)!;
    return s.currentFrame === minFrame;
  });

  // El candidato con el order más bajo es quien tira ahora.
  return candidates[0]?.playerId ?? null;
}
