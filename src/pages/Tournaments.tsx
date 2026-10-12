import { Link } from "react-router-dom";
import { Title } from "../ui/Shell";
import { useGame } from "../game/GameContext";
import { STATUS_LABEL } from "../ui/labels";

export function TournamentsPage() {
  const { state } = useGame();
  return (
    <div>
      <Title text="Torneos" sub="Los de demostración están marcados. Nunca se mezclan con un evento real." />
      <div className="grid gap-4">
        {state.tournaments.map((t) => (
          <Link key={t.id} to={`/t/${t.accessCode}`} className="card-arcade block hover:border-neon-gold">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-display text-2xl">{t.name}</p>
                <p className="text-white/70">{t.description || "Sin descripción"}</p>
              </div>
              <span className="rounded-full bg-neon-pink px-3 py-1 text-sm font-black uppercase">
                {STATUS_LABEL[t.status]}
              </span>
            </div>
            <p className="mt-3 font-mono text-xl tracking-[0.3em] text-neon-cyan">{t.accessCode}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
