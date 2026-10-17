import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { partyStore } from "../data/store";
import { useGame } from "../game/GameContext";
import { modifierById, MODIFIER_CATALOG } from "../domain/modifiers";
import { scoreGame } from "../domain/bowling";
import { laneRanking } from "../domain/lanePlaces";
import { currentTurnPlayerId } from "../domain/turn";
import { BigButton, Flash, Title } from "../ui/Shell";
import { beep } from "../ui/audio";
import { ROUND_NAME } from "../ui/labels";
import { uid } from "../domain/ids";

export function PlayerPage() {
  const { code } = useParams();
  const { state, session, muted } = useGame();
  const t = state.tournaments.find((x) => x.accessCode === code);
  const player = state.players.find((p) => p.tournamentId === t?.id && p.userId === session.userId && !p.banned)
    ?? state.players.find((p) => p.tournamentId === t?.id && !p.banned);
  const [picked, setPicked] = useState<string | null>(null);
  const [target, setTarget] = useState<string>("");
  const [msg, setMsg] = useState("");
  const [pinsGuess, setPinsGuess] = useState(10);
  const [rollError, setRollError] = useState<string | null>(null);

  if (!t || !player) {
    return (
      <div>
        <Title text="Sala de espera" sub="Inscríbete para entrar a tu panel." />
        <Link to={`/unirse/${code}`} className="btn-arcade bg-neon-gold">
          Ir a inscripción
        </Link>
      </div>
    );
  }

  const team = state.teams.find((x) => x.id === player.teamId);
  const liveRound = state.rounds.find((r) => r.tournamentId === t.id && r.status === "live") ?? state.rounds.find((r) => r.tournamentId === t.id);
  const game = state.games.find((g) => g.playerId === player.id && g.roundId === liveRound?.id);
  const lane = state.lanes.find((l) => l.id === game?.laneId);
  const laneGames = state.games.filter((g) => g.roundId === liveRound?.id && g.laneId === game?.laneId);
  const laneAssignments = state.assignments.filter((a) => a.roundId === liveRound?.id && a.laneId === game?.laneId);
  const ranking = laneRanking(laneGames);
  const place = ranking.find((r) => r.playerId === player.id)?.place;
  const inventory = state.inventory.filter((i) => i.playerId === player.id && i.roundId === liveRound?.id && (i.status === "held" || i.status === "waiting_choice"));
  const effects = state.effects.filter((e) => e.playerId === player.id && e.roundId === liveRound?.id);
  const events = state.events.filter((e) => e.tournamentId === t.id).slice(0, 8);
  const teammates = state.players.filter((p) => p.teamId === player.teamId && !p.banned);
  const scored = game ? scoreGame(game.rolls) : null;
  const selected = inventory.find((i) => i.id === picked);

  // ── Lógica de turnos ──────────────────────────────────────────────────────
  const isRoundLive = liveRound?.status === "live";
  const isRound1WithModifiers = liveRound?.kind === 1;
  const turnPlayerId =
    isRoundLive && game && lane
      ? currentTurnPlayerId(laneGames, laneAssignments, lane.id, liveRound!.id)
      : null;
  const isMyTurn = turnPlayerId === player.id;
  const turnPlayer = state.players.find((p) => p.id === turnPlayerId);

  // Tirada desde el móvil
  const handleRoll = (pins: number) => {
    if (!game || !liveRound) return;
    setRollError(null);
    try {
      partyStore.recordRoll({
        playerId: player.id,
        roundId: liveRound.id,
        pins,
        actorId: session.userId,
        expectedVersion: game.version,
        idempotencyKey: uid("roll"),
      });
      beep(pins === 10 ? "strike" : "click", muted);
    } catch (e) {
      setRollError(e instanceof Error ? e.message : "Error al registrar tirada");
    }
  };

  const activate = () => {
    if (!selected) return;
    try {
      const def = modifierById(selected.modifierId);
      const payload: Record<string, unknown> = { pins: pinsGuess, consent: true };
      partyStore.activate({
        inventoryId: selected.id,
        actorPlayerId: player.id,
        targetPlayerId: target || undefined,
        payload,
        idempotencyKey: crypto.randomUUID(),
      });
      beep(def.negative ? "hit" : "item", muted);
      setMsg(`${def.name} resuelto.`);
      setPicked(null);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Error");
    }
  };

  const dynamic = useMemo(() => {
    if (place === 1) return "¡Lideras tu pista!";
    if (place === 2) return "¡Has subido al segundo puesto!";
    return "Sigue empujando: los objetos favorecen a quien va detrás.";
  }, [place]);

  return (
    <div className="space-y-4 pb-24">
      <Title text={`${player.avatar} ${player.displayName}`} sub={`${team?.name ?? "Sin equipo"} · ${lane?.name ?? "Sin pista"} · ${liveRound ? ROUND_NAME[liveRound.kind] : "Esperando"}`} />
      <Flash>{dynamic}</Flash>
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Oficial" value={game?.official ?? 0} color="bg-white text-ink" />
        <Stat label="Bonus" value={game?.bonus ?? 0} color="bg-neon-cyan text-ink" />
        <Stat label="Total" value={game?.total ?? 0} color="bg-neon-gold text-ink" />
      </div>
      <p className="font-black">
        Frame {game?.currentFrame ?? "-"} · Puesto en pista {place ?? "-"} · Equipo {team?.name}
      </p>
      {scored && (
        <div className="flex gap-1 overflow-x-auto">
          {scored.frames.map((f) => (
            <div key={f.index} className="min-w-14 rounded-xl bg-black/40 p-1 text-center text-xs">
              <div className="font-mono">{f.display || "·"}</div>
              <div className={f.confirmed ? "text-neon-lime" : "text-white/50"}>{f.runningOfficial ?? "…"}</div>
            </div>
          ))}
        </div>
      )}
      {effects.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {effects.map((e) => (
            <span key={e.id} className="rounded-full bg-neon-violet px-3 py-1 text-sm font-black">
              {e.kind} ({e.remainingFrames})
            </span>
          ))}
        </div>
      )}

      {/* ── Panel de tirada ── */}
      {isRoundLive && game && !game.complete && scored && (
        <div className="card-arcade">
          {isMyTurn ? (
            <>
              <p className="mb-3 font-display text-2xl text-neon-lime">🎳 ¡Tu turno! Derriba los bolos</p>
              <p className="mb-2 text-sm opacity-70">
                Frame {scored.currentFrame} · Máximo: {scored.nextRollMax} bolos
              </p>
              <div className="flex flex-wrap gap-2">
                {Array.from({ length: scored.nextRollMax + 1 }, (_, pins) => (
                  <button
                    key={pins}
                    onClick={() => handleRoll(pins)}
                    className="h-12 w-12 rounded-xl bg-neon-gold font-black text-ink text-lg shadow"
                  >
                    {pins}
                  </button>
                ))}
              </div>
              {rollError && <p className="mt-2 font-black text-red-400">{rollError}</p>}
            </>
          ) : (
            <div className="flex items-center gap-3 py-2">
              <span className="text-4xl">{turnPlayer?.avatar ?? "🎳"}</span>
              <div>
                <p className="font-display text-xl">Turno de {turnPlayer?.displayName ?? "…"}</p>
                <p className="text-sm opacity-70">Espera tu turno para tirar</p>
              </div>
            </div>
          )}
        </div>
      )}
      {game?.complete && (
        <div className="card-arcade bg-neon-lime/20">
          <p className="font-display text-2xl">¡Partida completada! 🏆</p>
          <p className="text-sm opacity-70">Puntuación oficial: {game.official}</p>
        </div>
      )}

      {/* ── Inventario de modificadores (solo en Ronda 1) ── */}
      {isRound1WithModifiers && (
        <div className="card-arcade">
          <p className="font-display text-2xl">Inventario</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {inventory.map((i) => {
              const def = MODIFIER_CATALOG.find((m) => m.id === i.modifierId);
              return (
                <button
                  key={i.id}
                  onClick={() => setPicked(i.id)}
                  className={`rounded-2xl p-3 text-left ${picked === i.id ? "bg-neon-gold text-ink" : "bg-black/40"}`}
                >
                  <div className="text-3xl">{def?.icon}</div>
                  <div className="font-black">{def?.name}</div>
                  <div className="text-xs opacity-80">{def?.rarity}</div>
                </button>
              );
            })}
            {!inventory.length && <p>Sin objetos. Completa los frames 2, 4, 6 u 8 con toda la pista.</p>}
          </div>
          <AnimatePresence>
            {selected && (
              <motion.div initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="mt-4 space-y-3">
                <p>{modifierById(selected.modifierId).description}</p>
                {selected.status === "waiting_choice" && selected.choiceIds && (
                  <div className="grid gap-2">
                    {selected.choiceIds.map((id) => (
                      <BigButton
                        key={id}
                        onClick={() => {
                          partyStore.chooseLegendary(selected.id, id);
                          beep("win", muted);
                        }}
                      >
                        Elegir {modifierById(id).name}
                      </BigButton>
                    ))}
                  </div>
                )}
                <label className="block text-sm">
                  Objetivo
                  <select value={target} onChange={(e) => setTarget(e.target.value)} className="mt-1 w-full rounded-xl bg-black/40 p-2">
                    <option value="">(tú / automático)</option>
                    {laneGames
                      .filter((g) => g.playerId !== player.id)
                      .map((g) => {
                        const p = state.players.find((x) => x.id === g.playerId);
                        return (
                          <option key={g.playerId} value={g.playerId}>
                            {p?.displayName}
                          </option>
                        );
                      })}
                    {modifierById(selected.modifierId).targets === "teammate" &&
                      teammates
                        .filter((p) => p.id !== player.id)
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.displayName} (equipo)
                          </option>
                        ))}
                  </select>
                </label>
                <label className="block text-sm">
                  Predicción / objetivo de bolos
                  <input
                    type="number"
                    min={0}
                    max={10}
                    value={pinsGuess}
                    onChange={(e) => setPinsGuess(Number(e.target.value))}
                    className="mt-1 w-full rounded-xl bg-black/40 p-2"
                  />
                </label>
                <BigButton className="w-full" color="bg-neon-pink text-white" onClick={activate}>
                  Activar modificador
                </BigButton>
              </motion.div>
            )}
          </AnimatePresence>
          {msg && <p className="mt-3 font-black text-neon-lime">{msg}</p>}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Link className="btn-arcade bg-white" to={`/t/${code}/pista/${lane?.id ?? ""}`}>
          Vista de pista
        </Link>
        <Link className="btn-arcade bg-neon-cyan" to={`/t/${code}/clasificacion`}>
          Clasificación
        </Link>
        <Link className="btn-arcade bg-neon-violet text-white" to={`/t/${code}/spectator`}>
          Espectador
        </Link>
      </div>
      <div className="card-arcade">
        <p className="font-black">Eventos recientes</p>
        <ul className="mt-2 space-y-1 text-sm">
          {events.map((e) => (
            <li key={e.id}>{e.message}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className={`rounded-2xl p-3 text-center ${color}`}>
      <div className="text-xs font-black uppercase">{label}</div>
      <div className="font-display text-3xl">{value}</div>
    </div>
  );
}
