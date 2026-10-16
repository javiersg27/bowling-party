import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { partyStore } from "../data/store";
import { getSupabase, ensureAnonymousSession, supabaseConfigured } from "../data/supabase";
import { LiveSync } from "../data/live";
import { useGame } from "../game/GameContext";
import { type SyncStatus } from "../data/useLiveSync";
import { MODIFIER_CATALOG } from "../domain/modifiers";
import { describeAssignment } from "../domain/assignment";
import { BigButton, Title } from "../ui/Shell";
import { STATUS_LABEL } from "../ui/labels";
import { TEAM_PALETTE } from "../domain/types";
import type { TournamentSettings } from "../domain/types";

export function AdminHome() {
  const { state, becomeAdmin } = useGame();
  return (
    <div>
      <Title text="Panel de dirección" sub="Permisos reales en Supabase cuando el modo vivo esté activo. En demo, este panel desbloquea las acciones de director en este dispositivo." />
      <BigButton className="mb-6" onClick={() => becomeAdmin()}>
        Identificarme como director en este dispositivo
      </BigButton>
      <div className="grid gap-3">
        <Link to="/admin/nuevo" className="card-arcade block font-display text-2xl">
          + Crear torneo
        </Link>
        {state.tournaments.map((t) => (
          <Link key={t.id} to={`/admin/t/${t.id}`} className="card-arcade block">
            <p className="font-display text-2xl">{t.name}</p>
            <p>{STATUS_LABEL[t.status]} · {t.accessCode}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}

export function CreateTournamentPage() {
  const { session, becomeAdmin, mode, ensureIdentity } = useGame();
  const nav = useNavigate();
  const [name, setName] = useState("Gran Prix de la Bolera");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [laneCount, setLaneCount] = useState(3);
  const [teamCount, setTeamCount] = useState(4);
  const [maxPlayersPerTeam, setMaxPlayersPerTeam] = useState(3);
  const [playersPerLane, setPlayersPerLane] = useState(4);
  const [countWarmup, setCountWarmup] = useState(true);
  const [error, setError] = useState("");

  const submit = async () => {
    try {
      setError("");
      becomeAdmin();
      // En modo vivo el creador debe ser el auth.uid() REAL de Supabase: la
      // política RLS `tournaments_insert_creator` exige created_by = auth.uid().
      // La identidad local se alinea de forma asíncrona al entrar en "vivo" y
      // puede no estar lista todavía, lo que dejaba el torneo con un creador
      // "huérfano" que RLS rechazaba en silencio (nunca llegaba a la nube y el
      // móvil no lo encontraba por código). Lo resolvemos aquí de forma segura.
      let creatorId = session.userId;
      if (mode === "live" && supabaseConfigured()) {
        const authSession = await ensureAnonymousSession();
        creatorId = authSession?.user?.id ?? session.userId;
      }
      const t = partyStore.createTournament({
        name,
        description,
        date,
        createdBy: creatorId,
        settings: {
          laneCount,
          teamCount,
          maxPlayersPerTeam,
          playersPerLane,
          scoring: {
            countWarmupRound: countWarmup,
            round1UsesBonus: true,
            round2UsesBonus: false,
            round3UsesBonus: false,
            round3ModifiersEnabled: false,
            upperGroupSize: null,
            tieBreak: "previous_points",
            finalPositionsByRound3: true,
          },
        },
      });
      // Empuje EXPLÍCITO y esperado del torneo y su estructura recién creados.
      // El push incremental del sink es "fire-and-forget": si la nube lo rechazaba
      // (RLS, sesión aún no alineada…) el torneo se quedaba solo en local y el
      // móvil no lo encontraba. Aquí subimos a propósito y en orden correcto:
      //   1) torneo (INSERT; la política exige created_by = auth.uid()),
      //   2) membership admin (bootstrapping de RLS para el resto),
      //   3) equipos, pistas y rondas (las políticas de escritura exigen ser admin).
      // Sin los equipos en la nube, el lookup del móvil devolvía teams: [] y no
      // podía elegir equipo. Si algo falla, lo mostramos en pantalla.
      if (mode === "live" && supabaseConfigured()) {
        const sync = new LiveSync(getSupabase(), () => {});
        await sync.pushTournament(t);
        await sync.ensureMembership(t.id, creatorId, "admin");
        for (const team of partyStore.state.teams.filter((x) => x.tournamentId === t.id)) {
          await sync.pushTeam(team);
        }
        for (const lane of partyStore.state.lanes.filter((x) => x.tournamentId === t.id)) {
          await sync.pushLane(lane);
        }
        for (const round of partyStore.state.rounds.filter((x) => x.tournamentId === t.id)) {
          await sync.pushRound(round);
        }
      }
      nav(`/admin/t/${t.id}`);
      // Alinear la identidad local con el auth.uid() real de Supabase para que
      // activeTournamentId encuentre el torneo por createdBy === session.userId
      // y no tenga que depender del fallback por recencia.
      if (mode === "live" && supabaseConfigured()) {
        await ensureIdentity();
      }
    } catch (e) {
      // Supabase lanza objetos PostgrestError (no instanceof Error): extraemos su
      // message/code para no mostrar un "Error" genérico sin información.
      const err = e as { message?: string; code?: string; error_description?: string } | null;
      const detail = err?.message || err?.error_description || (e instanceof Error ? e.message : null);
      setError(detail ? `No se pudo crear el torneo: ${detail}${err?.code ? ` (${err.code})` : ""}` : "Error inesperado al crear el torneo.");
    }
  };

  return (
    <div className="mx-auto max-w-xl space-y-3">
      <Title text="Nuevo torneo" />
      <Field label="Nombre" value={name} onChange={setName} />
      <Field label="Descripción" value={description} onChange={setDescription} />
      <label className="block font-black">
        Fecha
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1 w-full rounded-2xl bg-black/40 p-3" />
      </label>
      <Num label="Pistas" value={laneCount} set={setLaneCount} />
      <Num label="Equipos" value={teamCount} set={setTeamCount} />
      <Num label="Máximo por equipo" value={maxPlayersPerTeam} set={setMaxPlayersPerTeam} />
      <Num label="Jugadores por pista" value={playersPerLane} set={setPlayersPerLane} />
      <label className="flex items-center gap-2 font-black">
        <input type="checkbox" checked={countWarmup} onChange={(e) => setCountWarmup(e.target.checked)} />
        ¿Contabilizar la ronda de calentamiento para la clasificación?
      </label>
      {error && <p className="text-neon-pink">{error}</p>}
      <BigButton className="w-full" onClick={submit}>
        Crear
      </BigButton>
    </div>
  );
}

export function AdminTournamentPage() {
  const { id } = useParams();
  const { state, session, syncStatus, syncError, forceSync, mode } = useGame();
  const t = state.tournaments.find((x) => x.id === id);
  const [tab, setTab] = useState<"control" | "mods" | "lanes" | "players">("control");
  const [confirm, setConfirm] = useState<string | null>(null);
  if (!t) return <p>Torneo no encontrado.</p>;
  if (!session.isAdmin) {
    return (
      <div>
        <p>Necesitas identificarte como director.</p>
        <Link to="/admin" className="btn-arcade bg-neon-gold">
          Ir al acceso
        </Link>
      </div>
    );
  }
  const syncLabel = (s: SyncStatus | undefined) => {
    switch (s) {
      case "pulling":
        return "Sincronizando con la nube…";
      case "error":
        return "Error de sincronización";
      case "ok":
        return "Sincronizado con la nube";
      default:
        return mode === "live" ? "En vivo" : "Demo (sin nube)";
    }
  };
  const players = state.players.filter((p) => p.tournamentId === t.id && !p.banned);
  const teams = state.teams.filter((x) => x.tournamentId === t.id);
  const lanes = state.lanes.filter((x) => x.tournamentId === t.id);
  const joinUrl = `${window.location.origin}${import.meta.env.BASE_URL}#/unirse/${t.accessCode}`;

  const act = (fn: () => void) => {
    try {
      fn();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Error");
    }
  };

  return (
    <div className="space-y-4 pb-16">
      <Title
        text={t.name}
        sub={`${STATUS_LABEL[t.status]} · código ${t.accessCode} · ${syncLabel(syncStatus)}${syncError ? ` (${syncError})` : ""}`}
      />
      <div className="flex flex-wrap gap-2">
        {(["control", "mods", "lanes", "players"] as const).map((k) => (
          <button key={k} onClick={() => setTab(k)} className={`rounded-full px-4 py-2 font-black ${tab === k ? "bg-neon-pink" : "bg-white/10"}`}>
            {k}
          </button>
        ))}
      </div>
      {tab === "control" && (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="card-arcade bg-white text-ink">
              <QRCodeSVG value={joinUrl} size={200} className="mx-auto" />
              <p className="mt-2 text-center font-mono text-2xl">{t.accessCode}</p>
              <p className="break-all text-center text-sm">{joinUrl}</p>
            </div>
            <div className="card-arcade space-y-2">
              <BigButton className="w-full" onClick={() => partyStore.setStatus(t.id, "registration", session.userId)}>
                Abrir inscripciones
              </BigButton>
              {mode === "live" && (
                <BigButton
                  className="w-full"
                  color="bg-neon-cyan"
                  onClick={() => void forceSync()}
                >
                  Sincronizar jugadores ahora
                </BigButton>
              )}
              <BigButton className="w-full" color="bg-white" onClick={() => partyStore.setStatus(t.id, "ready", session.userId)}>
                Cerrar inscripciones / Preparado
              </BigButton>
              <BigButton className="w-full" color="bg-neon-lime" onClick={() => partyStore.startRound(t.id, session.userId)}>
                Iniciar ronda
              </BigButton>
              <BigButton className="w-full" color="bg-neon-cyan" onClick={() => act(() => partyStore.completeRound(t.id, session.userId))}>
                Completar ronda actual
              </BigButton>
              <BigButton className="w-full" color="bg-white" onClick={() => act(() => partyStore.setStatus(t.id, "paused", session.userId))}>
                Pausar
              </BigButton>
              <BigButton
                className="w-full"
                color="bg-red-400"
                onClick={() => setConfirm("cancel")}
              >
                Cancelar torneo
              </BigButton>
              <BigButton
                className="w-full"
                color="bg-white"
                onClick={() => {
                  if (confirm === "archive") partyStore.setStatus(t.id, "archived", session.userId);
                  else setConfirm("archive");
                }}
              >
                Archivar
              </BigButton>
              <BigButton
                className="w-full"
                onClick={() => {
                  const blob = new Blob([partyStore.csv(t.id)], { type: "text/csv" });
                  const a = document.createElement("a");
                  a.href = URL.createObjectURL(blob);
                  a.download = `${t.accessCode}.csv`;
                  a.click();
                }}
              >
                Exportar CSV
              </BigButton>
              <BigButton className="w-full" color="bg-white" onClick={() => window.print()}>
                Exportar PDF (impresión)
              </BigButton>
              <BigButton className="w-full" color="bg-neon-pink text-white" onClick={() => { if (confirm === "demo") { partyStore.resetDemo(); setConfirm(null);} else setConfirm("demo"); }}>
                Reiniciar entorno de demostración
              </BigButton>
              {confirm && (
                <div className="rounded-2xl bg-black/50 p-3">
                  <p>¿Seguro? Acción: {confirm}</p>
                  <div className="mt-2 flex gap-2">
                    <BigButton
                      onClick={() => {
                        if (confirm === "cancel") partyStore.setStatus(t.id, "cancelled", session.userId);
                        if (confirm === "archive") partyStore.setStatus(t.id, "archived", session.userId);
                        if (confirm === "demo") partyStore.resetDemo();
                        setConfirm(null);
                      }}
                    >
                      Confirmar
                    </BigButton>
                    <BigButton color="bg-white" onClick={() => setConfirm(null)}>
                      No
                    </BigButton>
                  </div>
                </div>
              )}
            </div>
          </div>
          <label className="card-arcade flex items-center gap-2 font-black">
            <input
              type="checkbox"
              checked={t.settings.scoring.countWarmupRound}
              onChange={(e) => {
                const settings: TournamentSettings = {
                  ...t.settings,
                  scoring: { ...t.settings.scoring, countWarmupRound: e.target.checked },
                };
                partyStore.updateTournament(t.id, { settings });
              }}
            />
            ¿Contabilizar la ronda de calentamiento para la clasificación?
          </label>
          <div className="flex flex-wrap gap-2">
            <Link className="btn-arcade bg-white" to={`/t/${t.accessCode}/spectator`}>
              Pantalla espectador
            </Link>
            <Link className="btn-arcade bg-neon-cyan" to={`/t/${t.accessCode}/clasificacion`}>
              Clasificación
            </Link>
            <Link className="btn-arcade bg-neon-gold" to={`/t/${t.accessCode}/finales`}>
              Cuadro de finales
            </Link>
          </div>
        </div>
      )}
      {tab === "mods" && <ModifiersAdmin tournamentId={t.id} />}
      {tab === "lanes" && <LanesAdmin tournamentId={t.id} />}
      {tab === "players" && (
        <div className="card-arcade">
          {players.map((p) => {
            const team = teams.find((x) => x.id === p.teamId);
            return (
              <div key={p.id} className="flex items-center justify-between border-b border-white/10 py-2">
                <span>
                  {p.avatar} {p.displayName} · {team?.name}
                </span>
                <button className="text-neon-pink font-black" onClick={() => partyStore.kick(p.id, session.userId)}>
                  Expulsar
                </button>
              </div>
            );
          })}
          <p className="mt-3 text-sm text-white/70">
            {lanes.length} pistas · {teams.map((x) => x.name).join(", ")}
          </p>
        </div>
      )}
    </div>
  );
}

function ModifiersAdmin({ tournamentId }: { tournamentId: string }) {
  const { state } = useGame();
  const t = state.tournaments.find((x) => x.id === tournamentId)!;
  const [q, setQ] = useState("");
  const [rarity, setRarity] = useState("all");
  const mods = t.settings.modifiers;
  const list = MODIFIER_CATALOG.filter(
    (m) =>
      (rarity === "all" || m.rarity === rarity) &&
      m.name.toLowerCase().includes(q.toLowerCase()),
  );
  const patch = (partial: Partial<typeof mods>) =>
    partyStore.updateTournament(tournamentId, {
      settings: { ...t.settings, modifiers: { ...mods, ...partial, preset: "custom" } },
    });
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {(["fun", "competitive", "chaos"] as const).map((p) => (
          <BigButton key={p} onClick={() => partyStore.applyPreset(tournamentId, p)}>
            Preset {p}
          </BigButton>
        ))}
        <BigButton color="bg-white" onClick={() => patch({ enabledIds: MODIFIER_CATALOG.map((m) => m.id) })}>
          Activar todos
        </BigButton>
        <BigButton color="bg-white" onClick={() => patch({ enabledIds: [] })}>
          Desactivar todos
        </BigButton>
      </div>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar" className="w-full rounded-2xl bg-black/40 p-3" />
      <div className="flex gap-2">
        {["all", "common", "uncommon", "epic"].map((r) => (
          <button key={r} onClick={() => setRarity(r)} className={`rounded-full px-3 py-1 ${rarity === r ? "bg-neon-gold text-ink" : "bg-white/10"}`}>
            {r}
          </button>
        ))}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {list.map((m) => {
          const on = mods.enabledIds.includes(m.id);
          return (
            <button key={m.id} onClick={() => patch({ enabledIds: on ? mods.enabledIds.filter((x) => x !== m.id) : [...mods.enabledIds, m.id] })} className={`rounded-2xl p-3 text-left ${on ? "bg-white/15" : "bg-black/30 opacity-50"}`}>
              <div className="text-2xl">{m.icon}</div>
              <div className="font-black">{m.name}</div>
              <div className="text-xs">{m.description}</div>
            </button>
          );
        })}
      </div>
      <div className="card-arcade grid gap-2">
        <p className="font-black">Frecuencia (frames de objeto)</p>
        <input
          value={mods.checkpointFrames.join(",")}
          onChange={(e) =>
            patch({
              checkpointFrames: e.target.value
                .split(",")
                .map((x) => Number(x.trim()))
                .filter((n) => n >= 1 && n <= 9),
            })
          }
          className="rounded-xl bg-black/40 p-2"
        />
        <label>
          Inventario
          <input type="number" value={mods.inventoryLimit} onChange={(e) => patch({ inventoryLimit: Number(e.target.value) })} className="ml-2 rounded bg-black/40 p-1" />
        </label>
        <label className="flex gap-2">
          <input type="checkbox" checked={mods.physicalEffectsEnabled} onChange={(e) => patch({ physicalEffectsEnabled: e.target.checked })} />
          Efectos físicos
        </label>
      </div>
    </div>
  );
}

function LanesAdmin({ tournamentId }: { tournamentId: string }) {
  const { state, session } = useGame();
  const players = state.players.filter((p) => p.tournamentId === tournamentId && !p.banned);
  const teams = state.teams.filter((x) => x.tournamentId === tournamentId);
  const lanes = state.lanes.filter((x) => x.tournamentId === tournamentId);
  const round = state.rounds.find((r) => r.tournamentId === tournamentId && r.status === "live")
    ?? state.rounds.find((r) => r.tournamentId === tournamentId);
  const placed = state.assignments.filter((a) => a.roundId === round?.id);
  const result = {
    ok: placed.length > 0,
    warnings: [] as string[],
    placements: placed.map((a) => ({ playerId: a.playerId, laneId: a.laneId, order: a.order })),
  };

  return (
    <div className="space-y-3">
      <BigButton onClick={() => {
        try {
          partyStore.distribute(tournamentId, 1);
        } catch (e) {
          alert(e instanceof Error ? e.message : "Error");
        }
      }}>
        Redistribuir automáticamente
      </BigButton>
      <pre className="card-arcade whitespace-pre-wrap text-sm">
        {describeAssignment(result.ok ? result : { ...result, placements: state.assignments.filter((a) => a.roundId === round?.id).map((a) => ({ playerId: a.playerId, laneId: a.laneId, order: a.order })) }, players, teams, lanes)}
      </pre>
      {result.warnings?.map((w) => (
        <p key={w} className="text-neon-gold">
          {w}
        </p>
      ))}
      <p className="text-sm">Arrastra jugadores entre pistas (reasignación manual).</p>
      <div className="grid gap-3 md:grid-cols-3">
        {lanes.map((lane) => {
          const seated = state.assignments.filter((a) => a.roundId === round?.id && a.laneId === lane.id);
          return (
            <div
              key={lane.id}
              className="card-arcade min-h-40"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                const assignmentId = e.dataTransfer.getData("id");
                if (assignmentId) partyStore.moveAssignment(assignmentId, lane.id, seated.length);
              }}
            >
              <p className="font-display">{lane.name}</p>
              {seated.map((a) => {
                const p = players.find((x) => x.id === a.playerId);
                const team = teams.find((x) => x.id === p?.teamId);
                return (
                  <div
                    key={a.id}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData("id", a.id)}
                    className="mt-2 cursor-grab rounded-xl px-2 py-1"
                    style={{ background: team?.color }}
                  >
                    {p?.displayName}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
      <p className="text-xs">Responsable de pista: el director puede asignarse ({session.displayName}). Paleta: {TEAM_PALETTE[0].name}…</p>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block font-black">
      {label}
      <input value={value} onChange={(e) => onChange(e.target.value)} className="mt-1 w-full rounded-2xl bg-black/40 p-3" />
    </label>
  );
}
function Num({ label, value, set }: { label: string; value: number; set: (n: number) => void }) {
  return (
    <label className="block font-black">
      {label}
      <input type="number" value={value} onChange={(e) => set(Number(e.target.value))} className="mt-1 w-full rounded-2xl bg-black/40 p-3" />
    </label>
  );
}
