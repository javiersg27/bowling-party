import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { getMode, partyStore, setMode, type AppMode } from "../data/store";
import { ensureAnonymousSession, getSupabase, supabaseConfigured } from "../data/supabase";
import { useLiveSync } from "../data/useLiveSync";
import { makeLiveSink } from "../data/liveSink";
import type { EngineState } from "../data/engine";
import { uid } from "../domain/ids";

interface Session {
  userId: string;
  displayName: string;
  isAdmin: boolean;
}

interface GameCtx {
  mode: AppMode;
  liveReady: boolean;
  state: EngineState;
  session: Session;
  connected: boolean;
  liveError: string | null;
  reducedMotion: boolean;
  muted: boolean;
  setMuted: (v: boolean) => void;
  setReducedMotion: (v: boolean) => void;
  refresh: () => void;
  becomeAdmin: () => void;
  becomeGuest: (name?: string) => void;
  switchMode: (m: AppMode) => void;
}

const Ctx = createContext<GameCtx | null>(null);
const SESSION_KEY = "bowling-party-session";

function loadSession(): Session {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (raw) return JSON.parse(raw) as Session;
  } catch {
    /* ignore */
  }
  const session = { userId: uid("user"), displayName: "Invitado", isAdmin: false };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

export function GameProvider({ children }: { children: ReactNode }) {
  const [tick, setTick] = useState(0);
  const [session, setSession] = useState<Session>(() =>
    typeof localStorage === "undefined" ? { userId: "ssr", displayName: "Invitado", isAdmin: false } : loadSession(),
  );
  const [mode, setModeState] = useState<AppMode>(() => (typeof localStorage === "undefined" ? "demo" : getMode()));
  const [muted, setMuted] = useState(() => localStorage.getItem("bp-muted") === "1");
  const [reducedMotion, setReducedMotion] = useState(
    () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
  );
  const [connected, setConnected] = useState(true);

  useEffect(() => partyStore.subscribe(() => setTick((n) => n + 1)), []);
  useEffect(() => {
    const on = () => setConnected(true);
    const off = () => setConnected(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  const persistSession = (s: Session) => {
    setSession(s);
    localStorage.setItem(SESSION_KEY, JSON.stringify(s));
  };

  // Tiempo real: en modo "live" seguimos el torneo activo (o el primero).
  // Defensivo: si Supabase falla, la app continúa en el estado actual.
  const activeTournamentId = useMemo(() => {
    const list = partyStore.state.tournaments;
    const live = list.find((t) => t.status !== "finished" && t.status !== "archived");
    return (live ?? list[0])?.id ?? null;
  }, [tick]);

  const { error: liveError } = useLiveSync(mode, activeTournamentId, () => setTick((n) => n + 1));

  // Identidad real + empuje (push) en modo vivo.
  // Al entrar en "live" aseguramos una sesión anónima de Supabase y usamos su
  // user.id como identidad (las políticas RLS se basan en auth.uid()). Luego
  // conectamos el sink que traduce cada mutación local a upserts remotos.
  const liveUserIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (mode !== "live" || !supabaseConfigured()) {
      partyStore.setSyncSink(null);
      liveUserIdRef.current = null;
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const sb = getSupabase();
        const authSession = await ensureAnonymousSession();
        if (cancelled || !authSession?.user) return;
        const authUserId = authSession.user.id;
        liveUserIdRef.current = authUserId;
        // Si la identidad local no coincide con la de Supabase, la alineamos.
        if (session.userId !== authUserId) {
          persistSession({ ...session, userId: authUserId });
        }
        partyStore.setSyncSink(makeLiveSink(sb, authUserId, session.isAdmin ? "admin" : "player"));
      } catch (e) {
        // No fatal: seguimos en local. El error se refleja en liveError del hook.
        if (!cancelled) liveUserIdRef.current = null;
      }
    })();
    return () => {
      cancelled = true;
      partyStore.setSyncSink(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const value = useMemo<GameCtx>(
    () => ({
      mode,
      liveReady: supabaseConfigured(),
      state: partyStore.state,
      session,
      connected,
      liveError,
      reducedMotion,
      muted,
      setMuted: (v) => {
        setMuted(v);
        localStorage.setItem("bp-muted", v ? "1" : "0");
      },
      setReducedMotion,
      refresh: () => setTick((n) => n + 1),
      becomeAdmin: () => persistSession({ ...session, isAdmin: true, displayName: "Director" }),
      becomeGuest: (name) => persistSession({ ...session, isAdmin: false, displayName: name ?? session.displayName }),
      switchMode: (m) => {
        setMode(m);
        setModeState(m);
      },
    }),
    [mode, session, connected, reducedMotion, muted, tick, liveError],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useGame() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useGame fuera de proveedor");
  return ctx;
}
