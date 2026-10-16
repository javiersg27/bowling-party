import { Link, useParams } from "react-router-dom";
import { useGame } from "../game/GameContext";
import { type SyncStatus } from "../data/useLiveSync";
import { currentTeamRanking } from "../data/engine";
import { splitFinalGroups } from "../domain/finals";
import { Title } from "../ui/Shell";

export function FinalsPage() {
  const { code } = useParams();
  const { state } = useGame();
  const t = state.tournaments.find((x) => x.accessCode === code);
  if (!t) return <p>Torneo no encontrado.</p>;
  const ranked = currentTeamRanking(state, t.id);
  const groups = state.finalGroups.find((g) => g.tournamentId === t.id);
  const split = splitFinalGroups(ranked, t.settings.scoring);
  const upper = groups?.upper ?? split.upper.map((x) => x.teamId);
  const lower = groups?.lower ?? split.lower.map((x) => x.teamId);
  const name = (id: string) => state.teams.find((x) => x.id === id)?.name ?? id;
  const color = (id: string) => state.teams.find((x) => x.id === id)?.color;
  return (
    <div>
      <Title text="Cuadro de finales" sub={groups?.note ?? split.note} />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="card-arcade">
          <h2 className="font-display text-3xl text-neon-gold">Final superior</h2>
          <p className="text-sm opacity-80">El campeón sale de este grupo. El ganador inferior no puede superarlo.</p>
          {upper.map((id) => (
            <p key={id} className="mt-2 font-display text-2xl" style={{ color: color(id) }}>
              {name(id)}
            </p>
          ))}
        </div>
        <div className="card-arcade">
          <h2 className="font-display text-3xl text-neon-cyan">Final inferior</h2>
          {lower.map((id) => (
            <p key={id} className="mt-2 font-display text-2xl" style={{ color: color(id) }}>
              {name(id)}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}

export function HubPage() {
  const { code } = useParams();
  const { state, syncStatus, syncError, forceSync, mode } = useGame();
  const t = state.tournaments.find((x) => x.accessCode === code);
  if (!t) return <p>Torneo no encontrado.</p>;
  const players = state.players.filter((p) => p.tournamentId === t.id && !p.banned);
  const teams = state.teams.filter((x) => x.tournamentId === t.id);

  const syncLabel = (s: SyncStatus | undefined) => {
    switch (s) {
      case "pulling":
        return "Sincronizando…";
      case "error":
        return "Error de sincronización";
      case "ok":
        return "Sincronizado";
      default:
        return mode === "live" ? "En vivo" : "Demo (sin nube)";
    }
  };

  return (
    <div className="grid gap-3">
      <div className="card-arcade flex items-center justify-between gap-4 px-4 py-3">
        <div>
          <h1 className="font-display text-4xl">{t.name}</h1>
          <p className="text-white/70">{t.accessCode}</p>
        </div>
        <div className="text-right">
          <p className="font-display text-2xl">{players.length}</p>
          <p className="text-xs text-white/60">{syncLabel(syncStatus)}{syncError ? ` · ${syncError}` : ""}</p>
        </div>
      </div>
      <section className="card-arcade">
        <p className="font-black mb-3">Jugadores inscritos ({players.length})</p>
        {players.length > 0 ? (
          <ul className="space-y-1 text-sm">
            {players.map((p) => {
              const team = teams.find((x) => x.id === p.teamId);
              return (
                <li key={p.id} className="flex justify-between rounded-xl bg-black/30 px-3 py-2">
                  <span>{p.avatar} {p.displayName}</span>
                  <span className="text-white/60">{team?.name ?? "Sin equipo"}</span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-white/60 text-sm">Aún no hay jugadores inscritos. Comparte el código para que se unan.</p>
        )}
        {mode === "live" && (
          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={() => void forceSync()}
              className="rounded-xl bg-black/40 px-3 py-2 text-xs font-black hover:bg-white/20"
            >
              Actualizar jugadores
            </button>
            <p className="text-xs text-white/50">Se refresca automático cada pocos segundos.</p>
          </div>
        )}
      </section>
      <div className="grid gap-2">
        <Link className="card-arcade" to={`/t/${code}/jugador`}>
          Panel de jugador
        </Link>
        <Link className="card-arcade" to={`/t/${code}/clasificacion`}>
          Clasificación
        </Link>
        <Link className="card-arcade" to={`/t/${code}/spectator`}>
          Espectador
        </Link>
        <Link className="card-arcade" to={`/t/${code}/finales`}>
          Finales
        </Link>
      </div>
    </div>
  );
}
