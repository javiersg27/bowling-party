import { useParams } from "react-router-dom";
import { partyStore } from "../data/store";
import { useGame } from "../game/GameContext";
import { scoreGame, validateRoll } from "../domain/bowling";
import { currentTurnPlayerId } from "../domain/turn";
import { BigButton, Title } from "../ui/Shell";
import { beep } from "../ui/audio";
import { uid } from "../domain/ids";

export function LaneViewPage() {
  const { code, laneId } = useParams();
  const { state, session, muted } = useGame();
  const t = state.tournaments.find((x) => x.accessCode === code);
  const lane = state.lanes.find((l) => l.id === laneId) ?? state.lanes.find((l) => l.tournamentId === t?.id);
  const round = state.rounds.find((r) => r.tournamentId === t?.id && r.status === "live") ?? state.rounds.find((r) => r.tournamentId === t?.id);
  const games = state.games.filter((g) => g.roundId === round?.id && g.laneId === lane?.id);
  const assignments = state.assignments.filter((a) => a.roundId === round?.id && a.laneId === lane?.id);
  const isAdmin = session.isAdmin || lane?.marshalId === session.userId;

  // Quién tira ahora (para el indicador visual)
  const turnPlayerId =
    round?.status === "live" && lane
      ? currentTurnPlayerId(games, assignments, lane.id, round.id)
      : null;

  const add = (playerId: string, pins: number) => {
    const g = games.find((x) => x.playerId === playerId);
    if (!g || !round) return;
    const err = validateRoll(g.rolls, pins);
    if (err) {
      alert(err);
      return;
    }
    try {
      partyStore.recordRoll({
        playerId,
        roundId: round.id,
        pins,
        actorId: session.userId,
        expectedVersion: g.version,
        idempotencyKey: uid("roll"),
      });
      beep(pins === 10 ? "strike" : "click", muted);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Error");
    }
  };

  return (
    <div>
      <Title text={lane?.name ?? "Pista"} sub="Introduce los bolos derribados. El sistema calcula strikes, spares y el décimo frame." />

      {/* Indicador de turno */}
      {turnPlayerId && (
        <div className="mb-4 flex items-center gap-3 rounded-2xl bg-neon-gold/20 px-4 py-3">
          <span className="text-3xl">
            {state.players.find((p) => p.id === turnPlayerId)?.avatar ?? "🎳"}
          </span>
          <div>
            <p className="font-display text-xl">
              Turno de {state.players.find((p) => p.id === turnPlayerId)?.displayName}
            </p>
            <p className="text-sm opacity-70">
              {isAdmin ? "Los jugadores tiran desde su móvil · el admin puede introducir manualmente abajo" : "Esperando tirada…"}
            </p>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {games.map((g) => {
          const p = state.players.find((x) => x.id === g.playerId);
          const team = state.teams.find((x) => x.id === p?.teamId);
          const s = scoreGame(g.rolls);
          const isCurrentTurn = g.playerId === turnPlayerId;
          return (
            <div
              key={g.playerId}
              className={`card-arcade transition-all ${isCurrentTurn ? "ring-2 ring-neon-gold" : ""}`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-display text-2xl">
                    {isCurrentTurn && <span className="mr-1 text-neon-gold">▶</span>}
                    {p?.avatar} {p?.displayName}
                  </p>
                  <p style={{ color: team?.color }}>{team?.name}</p>
                </div>
                <div className="text-right">
                  <p className="font-display text-3xl text-neon-gold">{g.total}</p>
                  <p className="text-xs">
                    Oficial {g.official} · Bonus {g.bonus} · {g.scoreStatus}
                  </p>
                </div>
              </div>
              <div className="mt-2 flex gap-1 overflow-x-auto">
                {s.frames.map((f) => (
                  <div key={f.index} className="min-w-12 rounded bg-black/30 p-1 text-center text-[11px]">
                    <div>{f.display || `${f.index}`}</div>
                    <div className={f.confirmed ? "text-neon-lime" : "text-white/40"}>{f.runningOfficial ?? ""}</div>
                  </div>
                ))}
              </div>
              {isAdmin && !g.complete && g.playerId === turnPlayerId && (
                <div className="mt-3 flex flex-wrap gap-1">
                  {Array.from({ length: s.nextRollMax + 1 }, (_, pins) => (
                    <button
                      key={pins}
                      onClick={() => add(g.playerId, pins)}
                      className="h-10 w-10 rounded-xl bg-white font-black text-ink"
                    >
                      {pins}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {session.isAdmin && round && (
        <div className="mt-4">
          <BigButton
            color="bg-white"
            onClick={() => {
              const pid = turnPlayerId ?? games[0]?.playerId;
              const total = Number(prompt("Total excepcional (0-300). Quedará auditado.") ?? "");
              if (!pid || Number.isNaN(total)) return;
              partyStore.recordRoll({
                playerId: pid,
                roundId: round.id,
                pins: 0,
                actorId: session.userId,
                expectedVersion: games[0].version,
                idempotencyKey: uid("ex"),
                exceptionalTotal: total,
              });
            }}
          >
            Introducir total excepcional
          </BigButton>
        </div>
      )}
    </div>
  );
}
