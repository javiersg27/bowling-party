import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { AVATARS } from "../domain/types";
import { partyStore } from "../data/store";
import { getSupabase, supabaseConfigured } from "../data/supabase";
import { LiveSync } from "../data/live";
import { fetchJoinBundle } from "../data/hydrate";
import { useGame } from "../game/GameContext";
import { BigButton, Title } from "../ui/Shell";
import { beep } from "../ui/audio";

export function JoinPage() {
  const { code: codeParam } = useParams();
  const { state, session, muted, mode, ensureIdentity } = useGame();
  const nav = useNavigate();
  const [code, setCode] = useState(codeParam?.toUpperCase() ?? "");
  const [name, setName] = useState(session.displayName === "Invitado" ? "" : session.displayName);
  const [avatar, setAvatar] = useState(AVATARS[0]);
  const [teamId, setTeamId] = useState("");
  const [error, setError] = useState("");
  const [lookup, setLookup] = useState<"idle" | "loading" | "notfound" | "error">("idle");
  const tournament = useMemo(
    () => state.tournaments.find((t) => t.accessCode === code.toUpperCase()),
    [state, code],
  );
  const teams = state.teams.filter((t) => t.tournamentId === tournament?.id);

  // Modo "live": descubrimos/actualizamos el torneo por su código en la nube. Así un
  // dispositivo ajeno puede unirse al torneo creado en otro (el estado vive en
  // localStorage, que NO se comparte entre dispositivos). Importante: NO guardamos por
  // "ya está en local" — el status puede cambiar en la nube (p. ej. el director abre
  // inscripciones) y el móvil debe re-consultarlo. Con debounce para no disparar una
  // petición por cada tecla; `state.tournaments` NO está en deps para no buclear con hydrate.
  useEffect(() => {
    if (mode !== "live" || !supabaseConfigured()) return;
    const c = code.trim().toUpperCase();
    if (c.length < 6) {
      setLookup("idle");
      return;
    }
    let cancelled = false;
    setLookup("loading");
    const timer = window.setTimeout(() => {
      fetchJoinBundle(getSupabase(), c)
        .then((bundle) => {
          if (cancelled) return;
          if (!bundle) {
            setLookup("notfound");
            return;
          }
          partyStore.hydrate(bundle);
          setLookup("idle");
        })
        .catch(() => {
          if (!cancelled) setLookup("error");
        });
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [code, mode]);

  const submit = async () => {
    try {
      setError("");
      // Identidad REAL primero: en modo vivo aseguramos la sesión anónima de
      // Supabase y alineamos session.userId a su auth.uid(). Si inscribiéramos con
      // un user_id local obsoleto, RLS (players_insert_self exige
      // user_id = auth.uid()) rechazaría el INSERT en silencio y el jugador nunca
      // llegaría a la nube → el host no lo vería.
      const userId = await ensureIdentity();
      // Re-validamos el estado del torneo contra la nube justo antes de confirmar:
      // el status (p. ej. "inscripciones abiertas") puede haber cambiado desde la
      // última hidratación y el localStorage local quedaría obsoleto.
      if (mode === "live" && supabaseConfigured()) {
        const fresh = await fetchJoinBundle(getSupabase(), code.toUpperCase());
        if (fresh) partyStore.hydrate(fresh);
      }
      const player = partyStore.join({
        code: code.toUpperCase(),
        userId,
        displayName: name,
        avatar,
        teamId: teamId || undefined,
      });

      // En modo vivo aseguramos la subida explícita a Supabase antes de navegar.
      // Así garantizamos que la membresía y el jugador quedan guardados en la nube
      // (y si hubiera un error de red o RLS, se captura y muestra aquí al usuario).
      if (mode === "live" && supabaseConfigured()) {
        const t = partyStore.state.tournaments.find((x) => x.accessCode === code.toUpperCase());
        if (t) {
          const sync = new LiveSync(getSupabase(), () => {});
          await sync.ensureMembership(t.id, userId, "player");
          await sync.pushPlayer(player);
        }
      }

      beep("item", muted);
      nav(`/t/${code.toUpperCase()}/jugador`);
      void player;
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo inscribir");
    }
  };

  return (
    <div className="mx-auto max-w-lg">
      <Title text="Inscripción" sub="Introduce el código de la fiesta, elige avatar y equipo. Sin email." />
      <div className="card-arcade space-y-4">
        <label className="block font-black">
          Código
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            className="mt-1 w-full rounded-2xl bg-black/40 p-3 font-mono text-2xl tracking-[0.4em]"
            maxLength={8}
          />
        </label>
        <label className="block font-black">
          Nombre
          <input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full rounded-2xl bg-black/40 p-3" />
        </label>
        <p className="font-black">Avatar</p>
        <div className="flex flex-wrap gap-2">
          {AVATARS.map((a) => (
            <button
              key={a}
              className={`grid h-12 w-12 place-items-center rounded-2xl text-2xl ${avatar === a ? "bg-neon-gold" : "bg-black/40"}`}
              onClick={() => setAvatar(a)}
            >
              {a}
            </button>
          ))}
        </div>
        {teams.length > 0 && (
          <>
            <p className="font-black">Equipo</p>
            <div className="grid grid-cols-2 gap-2">
              {teams.map((team) => {
                const n = state.players.filter((p) => p.teamId === team.id && !p.banned).length;
                const full = n >= (tournament?.settings.maxPlayersPerTeam ?? 99);
                return (
                  <button
                    key={team.id}
                    disabled={full}
                    onClick={() => setTeamId(team.id)}
                    className="rounded-2xl p-3 font-black disabled:opacity-40"
                    style={{ background: team.color, outline: teamId === team.id ? "4px solid white" : undefined }}
                  >
                    {team.name} ({n})
                  </button>
                );
              })}
            </div>
          </>
        )}
        {lookup === "loading" && <p className="text-neon-gold">Buscando el torneo en la nube…</p>}
        {lookup === "notfound" && !error && (
          <p className="text-neon-pink">Ese código no existe todavía en la nube.</p>
        )}
        {lookup === "error" && !error && (
          <p className="text-neon-pink">No se pudo consultar la nube. Revisa la conexión.</p>
        )}
        {error && <p className="text-neon-pink">{error}</p>}
        <BigButton className="w-full" onClick={submit}>
          Confirmar inscripción
        </BigButton>
      </div>
    </div>
  );
}

export function JoinQr({ url, code }: { url: string; code: string }) {
  return (
    <div className="card-arcade bg-white text-ink">
      <QRCodeSVG value={url} size={220} className="mx-auto" />
      <p className="mt-3 text-center font-mono text-3xl tracking-[0.3em]">{code}</p>
    </div>
  );
}
