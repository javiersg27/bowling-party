import { useEffect, useRef } from "react";
import { getSupabase, supabaseConfigured } from "./supabase";
import { LiveSync } from "./live";
import type { AppMode } from "./store";

/**
 * Conecta la suscripción Realtime de un torneo cuando el modo es "live".
 *
 * Es defensivo a propósito: si Supabase no está configurado, si falla la
 * conexión o si Realtime no está habilitado, la app sigue funcionando con el
 * estado actual (no rompe el modo demo ni la UI). Devuelve el estado de error
 * para que la interfaz pueda avisar sin tumbar la partida.
 *
 * @param mode      modo actual ("demo" | "live")
 * @param tournamentId torneo a seguir (si aplica)
 * @param onChange  callback para refrescar la UI ante cambios remotos
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
    try {
      const sb = getSupabase();
      const sync = new LiveSync(sb, () => onChangeRef.current());
      unsub = sync.subscribeTournament(tournamentId);
      errRef.current = null;
    } catch (e) {
      // No fatal: continuamos en el estado local. Se expone para la UI.
      errRef.current = e instanceof Error ? e.message : "No se pudo conectar en vivo.";
    }
    return () => {
      if (unsub) unsub();
    };
  }, [mode, tournamentId]);

  return { error: errRef.current };
}
