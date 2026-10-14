import { useEffect, useRef } from "react";
import { getSupabase, supabaseConfigured } from "./supabase";
import { LiveSync } from "./live";
import { pullTournament } from "./hydrate";
import { partyStore } from "./store";
import type { AppMode } from "./store";

/**
 * Conecta la suscripción Realtime de un torneo cuando el modo es "live".
 *
 * A diferencia de un simple "re-render", cuando llega un cambio remoto se hace
 * un **pull** real del torneo (`pullTournament`) y se fusiona en el store
 * (`hydrateRemote`). Así los datos creados en OTROS dispositivos —p. ej. un
 * jugador que se inscribe desde su móvil— aparecen en el host (PC) sin recargar.
 *
 * Es defensivo a propósito: si Supabase no está configurado, si falla la
 * conexión o si Realtime/RLS rechazan, la app sigue funcionando con el estado
 * actual (no rompe el modo demo ni la UI). Devuelve el estado de error para que
 * la interfaz pueda avisar sin tumbar la partida.
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
    let unsub: (() => void) | null = null;
    let cancelled = false;

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

    try {
      const sb = getSupabase();
      const sync = new LiveSync(sb, schedulePull);
      unsub = sync.subscribeTournament(tournamentId);
      errRef.current = null;
      // Pull inicial: refleja de inmediato lo que ya haya en la nube (jugadores
      // inscritos antes de que este dispositivo se suscribiera).
      void doPull();
    } catch (e) {
      errRef.current = e instanceof Error ? e.message : "No se pudo conectar en vivo.";
    }
    return () => {
      cancelled = true;
      if (debounce !== undefined) window.clearTimeout(debounce);
      if (unsub) unsub();
    };
  }, [mode, tournamentId]);

  return { error: errRef.current };
}
