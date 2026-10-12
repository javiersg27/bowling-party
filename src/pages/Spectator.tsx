import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useGame } from "../game/GameContext";
import { mergeRounds, rankTeams } from "../domain/rankings";
import { playerPointsForRound } from "../data/engine";
import { ROUND_NAME, STATUS_LABEL } from "../ui/labels";
import { modifierById } from "../domain/modifiers";

export function SpectatorPage() {
  const { code } = useParams();
  const { state } = useGame();
  const t = state.tournaments.find((x) => x.accessCode === code);
  const [full, setFull] = useState(false);
  const [clock, setClock] = useState(10);
  useEffect(() => {
    const id = setInterval(() => setClock((c) => (c <= 0 ? 10 : c - 1)), 1000);
    return () => clearInterval(id);
  }, []);
  if (!t) return <p>Torneo no encontrado.</p>;
  const players = state.players.filter((p) => p.tournamentId === t.id && !p.banned);
  const teams = state.teams.filter((x) => x.tournamentId === t.id);
  const merged = mergeRounds(
    players,
    [
      { round: 1, points: playerPointsForRound(state, t.id, 1) },
      { round: 2, points: playerPointsForRound(state, t.id, 2) },
    ],
    t.settings.scoring,
  );
  const teamRows = rankTeams(teams, merged);
  const live = state.rounds.find((r) => r.tournamentId === t.id && r.status === "live");
  const lanes = state.lanes.filter((l) => l.tournamentId === t.id);
  const events = state.events.filter((e) => e.tournamentId === t.id).slice(0, 6);
  const finished = t.status === "finished";
  const podium = teamRows.slice(0, 3);

  return (
    <div className={`${full ? "fixed inset-0 z-50 overflow-auto p-6 arcade-bg" : ""}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="font-display text-5xl text-neon-gold">{t.name}</p>
          <p className="text-2xl text-neon-cyan">
            {STATUS_LABEL[t.status]} · {live ? ROUND_NAME[live.kind] : "Sala"}
          </p>
        </div>
        <div className="text-right">
          <button className="btn-arcade bg-white" onClick={() => void document.documentElement.requestFullscreen().then(() => setFull(true)).catch(() => setFull(true))}>
            Pantalla completa
          </button>
          <p className="mt-3 font-display text-4xl">⏱ {clock}</p>
        </div>
      </div>
      {finished && (
        <div className="mt-8 flex items-end justify-center gap-4">
          { [podium[1], podium[0], podium[2]].map((row, i) =>
            row ? (
              <motion.div
                key={row.teamId}
                initial={{ y: 40, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="w-40 rounded-t-[2rem] border-4 border-white/30 text-center"
                style={{ height: i === 1 ? 220 : i === 0 ? 160 : 120, background: row.color }}
              >
                <p className="mt-4 font-display text-4xl">{i === 1 ? "1" : i === 0 ? "2" : "3"}</p>
                <p className="font-black">{row.name}</p>
              </motion.div>
            ) : null,
          )}
        </div>
      )}
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <section className="card-arcade">
          <h2 className="font-display text-3xl">Clasificación</h2>
          {teamRows.map((r) => (
            <motion.div layout key={r.teamId} className="mt-2 flex justify-between text-2xl font-black">
              <span style={{ color: r.color }}>
                {r.place}. {r.name}
              </span>
              <span>{r.tournamentPoints}</span>
            </motion.div>
          ))}
        </section>
        <section className="card-arcade">
          <h2 className="font-display text-3xl">Pistas</h2>
          {lanes.map((lane) => {
            const gs = state.games.filter((g) => g.roundId === live?.id && g.laneId === lane.id);
            return (
              <div key={lane.id} className="mt-3">
                <p className="text-neon-gold font-black">{lane.name}</p>
                {gs.map((g) => {
                  const p = players.find((x) => x.id === g.playerId);
                  const team = teams.find((x) => x.id === p?.teamId);
                  return (
                    <p key={g.playerId} className="text-xl">
                      {p?.displayName} <span style={{ color: team?.color }}>({team?.name})</span> {g.total}
                    </p>
                  );
                })}
              </div>
            );
          })}
        </section>
      </div>
      <section className="mt-4 card-arcade">
        <h2 className="font-display text-3xl">Últimos eventos</h2>
        <AnimatePresence>
          {events.map((e) => (
            <motion.p key={e.id} initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} className="text-xl">
              {e.type === "modifier" && e.payload.modifierId
                ? `${modifierById(String(e.payload.modifierId)).icon} `
                : ""}
              {e.message}
            </motion.p>
          ))}
        </AnimatePresence>
      </section>
    </div>
  );
}
