import { useEffect, useRef } from "react";
import { ensureAnonymousSession, getSupabase, supabaseConfigured } from "./supabase";
import { LiveSync } from "./live";
import { pullTournament } from "./hydrate";
import { partyStore } from "./store";
import type { AppMode } from "./store";

// Intervalo del pull de respaldo (ms). Cubre el caso en que Realtime no entrega
// eventos (red, token todavía propagándose, tabla fuera de la publicación…).
const POLL_MS = 5000;

/**
 * Conecta la sincronización en vivo de un torneo cuando el modo es "live".
 *
 * Estrategia (robusta e independiente de Realtime):
 *   1. Espera a que exista sesión anónima (JWT). Sin ella, RLS oculta todas las
 *      filas (auth.uid() es null) y Realtime no entrega eventos: suscribirse
 *      antes de autenticar es la causa clásica de "no me llegan los jugadores".
 *   2. Se suscribe a Realtime y, ante cada cambio, hace un **pull** real del
 *      torneo (`pullTournament`) y lo fusiona (`hydrateRemote`).
 *   3. Además, un **pull periódico de respaldo**: aunque Realtime falle, el host
 *      refleja en pocos segundos las altas de otros dispositivos (p. ej. un
 *      jugador que se inscribe desde su móvil).
 *
 * Es defensivo a propósito: si Supabase no está configurado o falla, la app
 * sigue con el estado actual y expone el error para la UI sin tumbar la partida.
 *
 * @param mode      modo actual ("demo" | "live")
 * @param tournamentId torneo a seguir (si aplica)
 * @param onChange  callback extra para refrescar la UI (p. ej. forzar re-render)
 */
export function useLiveSync(
  mode: AppMode,
  tournamentId: string | null,
  onChange: () => void,
): { error: string | null } {
  const errRef = useRef<string | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (mode !== "live" || !tournamentId || !supabaseConfigured()) return;
    let cancelled = false;
    let unsub: (() => void) | null = null;
    let poll: number | undefined;

    // Control de concurrencia + debounce: una ráfaga de eventos Realtime (p. ej.
    // al inscribirse un jugador se tocan varias tablas) provoca UN solo pull.
    let pulling = false;
    let pendingPull = false;
    let debounce: number | undefined;

    const doPull = async () => {
      if (pulling) {
        pendingPull = true;
        return;
      }
      pulling = true;
      try {
        const remote = await pullTournament(getSupabase(), tournamentId);
        if (cancelled) return;
        partyStore.hydrateRemote(remote);
        errRef.current = null;
        // hydrateRemote ya notifica a los listeners; reforzamos por si el
        // listener externo hace algo más que re-renderizar.
        onChangeRef.current();
      } catch (e) {
        // No fatal: seguimos con el estado local. Se expone para la UI.
        if (!cancelled) {
          errRef.current = e instanceof Error ? e.message : "No se pudo sincronizar en vivo.";
        }
      } finally {
        pulling = false;
        // Si llegaron cambios durante el pull, repetimos una última vez.
        if (pendingPull && !cancelled) {
          pendingPull = false;
          void doPull();
        }
      }
    };

    const schedulePull = () => {
      if (debounce !== undefined) window.clearTimeout(debounce);
      debounce = window.setTimeout(() => {
        debounce = undefined;
        void doPull();
      }, 120);
    };

    const start = async () => {
      try {
        // CLAVE: garantizar JWT antes de suscribir/hacer pull. Así Realtime
        // entrega eventos y el pull pasa el filtro RLS por membresía.
        await ensureAnonymousSession();
        if (cancelled) return;
        const sb = getSupabase();
        const sync = new LiveSync(sb, schedulePull);
        unsub = sync.subscribeTournament(tournamentId);
        errRef.current = null;
        // Pull inicial: refleja de inmediato lo que ya haya en la nube.
        void doPull();
        // Respaldo por polling (pausado si la pestaña está oculta).
        poll = window.setInterval(() => {
          if (typeof document !== "undefined" && document.hidden) return;
          void doPull();
        }, POLL_MS);
      } catch (e) {
        if (!cancelled) {
          errRef.current = e instanceof Error ? e.message : "No se pudo conectar en vivo.";
        }
      }
    };

    void start();

    const onVisibility = () => {
      if (typeof document !== "undefined" && !document.hidden) void doPull();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      if (debounce !== undefined) window.clearTimeout(debounce);
      if (poll !== undefined) window.clearInterval(poll);
      if (unsub) unsub();
    };
  }, [mode, tournamentId]);

  return { error: errRef.current };
}

