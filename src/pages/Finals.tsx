import { Link, useParams } from "react-router-dom";
import { useGame } from "../game/GameContext";
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
  const { state } = useGame();
  const t = state.tournaments.find((x) => x.accessCode === code);
  if (!t) return <p>Torneo no encontrado.</p>;
  return (
    <div className="grid gap-3">
      <h1 className="font-display text-4xl">{t.name}</h1>
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
  );
}
