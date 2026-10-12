import { useParams } from "react-router-dom";
import { useGame } from "../game/GameContext";
import { mergeRounds, rankPlayers, rankTeams } from "../domain/rankings";
import { playerPointsForRound } from "../data/engine";
import { Title } from "../ui/Shell";

export function StandingsPage() {
  const { code } = useParams();
  const { state } = useGame();
  const t = state.tournaments.find((x) => x.accessCode === code);
  if (!t) return <p>Torneo no encontrado.</p>;
  const players = state.players.filter((p) => p.tournamentId === t.id && !p.banned);
  const teams = state.teams.filter((x) => x.tournamentId === t.id);
  const merged = mergeRounds(
    players,
    [
      { round: 1, points: playerPointsForRound(state, t.id, 1) },
      { round: 2, points: playerPointsForRound(state, t.id, 2) },
      { round: 3, points: playerPointsForRound(state, t.id, 3) },
    ],
    t.settings.scoring,
  );
  const teamRows = rankTeams(teams, merged);
  const lanes = state.lanes.filter((l) => l.tournamentId === t.id);
  const live = state.rounds.find((r) => r.tournamentId === t.id && r.status === "live");

  return (
    <div className="space-y-6">
      <Title text="Clasificación" sub="Puntos de torneo según las reglas configuradas. La ronda 1 cuenta si está activado el interruptor de calentamiento." />
      <p className="card-arcade">
        ¿Contabilizar la ronda de calentamiento para la clasificación?{" "}
        <b>{t.settings.scoring.countWarmupRound ? "Sí" : "No"}</b>
      </p>
      <section className="card-arcade">
        <h2 className="font-display text-3xl">Por equipos</h2>
        <table className="mt-3 w-full text-left">
          <thead>
            <tr className="text-neon-cyan">
              <th>#</th>
              <th>Equipo</th>
              <th>Torneo</th>
              <th>Oficial</th>
            </tr>
          </thead>
          <tbody>
            {teamRows.map((r) => (
              <tr key={r.teamId} className="border-t border-white/10">
                <td className="py-2 font-display text-2xl">{r.place}</td>
                <td style={{ color: r.color }} className="font-black">
                  {r.name}
                </td>
                <td>{r.tournamentPoints}</td>
                <td>{r.official}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="card-arcade">
        <h2 className="font-display text-3xl">Por jugadores</h2>
        <div className="mt-3 space-y-2">
          {merged.map((r) => (
            <div key={r.playerId} className="flex justify-between rounded-xl bg-black/30 px-3 py-2">
              <span>
                {r.place}. {r.displayName}
              </span>
              <span>
                {r.tournamentPoints} · of {r.official} · b {r.bonus}
              </span>
            </div>
          ))}
        </div>
      </section>
      {live && (
        <section>
          <h2 className="font-display text-3xl">Por pistas</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            {lanes.map((lane) => {
              const gs = state.games.filter((g) => g.roundId === live.id && g.laneId === lane.id);
              const ranked = rankPlayers(
                players.filter((p) => gs.some((g) => g.playerId === p.id)),
                gs.map((g) => ({ playerId: g.playerId, official: g.official, bonus: g.bonus })),
                gs.map((g) => g.playerId),
              );
              return (
                <div key={lane.id} className="card-arcade">
                  <h3 className="font-display text-xl">{lane.name}</h3>
                  {ranked.map((r) => (
                    <p key={r.playerId}>
                      {r.place}. {r.displayName} · {r.total}
                    </p>
                  ))}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
