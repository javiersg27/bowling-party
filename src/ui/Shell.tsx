import { Link, NavLink, useLocation } from "react-router-dom";
import { MotionGlobalConfig, motion } from "framer-motion";
import { Trophy, Volume2, VolumeX, Wifi, WifiOff, Sparkles } from "lucide-react";
import { useGame } from "../game/GameContext";
import { useEffect } from "react";

export function Shell({ children }: { children: React.ReactNode }) {
  const { connected, muted, setMuted, reducedMotion, session, mode, liveError } = useGame();
  const loc = useLocation();
  useEffect(() => {
    MotionGlobalConfig.skipAnimations = reducedMotion;
  }, [reducedMotion]);

  const spectator = loc.pathname.includes("/spectator");

  return (
    <div className="arcade-bg min-h-dvh">
      {liveError && mode === "live" && (
        <div className="bg-red-500/20 px-4 py-2 text-center text-sm font-bold text-red-100">
          Modo vivo con problemas: {liveError} · Puedes seguir jugando en local.
        </div>
      )}
      {!spectator && (
        <header className="sticky top-0 z-30 border-b border-white/10 bg-[#14061f]/80 backdrop-blur-md">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
            <Link to="/" className="flex items-center gap-2">
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-neon-gold text-2xl shadow-arcade">🎳</span>
              <div>
                <p className="font-display text-lg leading-none text-neon-gold">BOWLING PARTY</p>
                <p className="text-xs uppercase tracking-[0.2em] text-neon-cyan">Arcade Tourney</p>
              </div>
            </Link>
            <nav className="hidden items-center gap-2 md:flex">
              <NavLink className={navCls} to="/torneos">
                Torneos
              </NavLink>
              <NavLink className={navCls} to="/unirse">
                Unirse
              </NavLink>
              <NavLink className={navCls} to="/admin">
                Dirección
              </NavLink>
            </nav>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold uppercase">
                {mode === "demo" ? "Demo aislada" : "En vivo"}
              </span>
              <button
                className="rounded-full bg-white/10 p-2"
                onClick={() => setMuted(!muted)}
                aria-label={muted ? "Activar sonido" : "Silenciar"}
              >
                {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
              </button>
              <span className="hidden items-center gap-1 text-xs sm:flex">
                {connected ? <Wifi size={14} className="text-neon-lime" /> : <WifiOff size={14} className="text-red-400" />}
                {session.displayName}
              </span>
            </div>
          </div>
        </header>
      )}
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
      {!spectator && (
        <nav className="fixed bottom-3 left-1/2 z-30 flex w-[min(92vw,420px)] -translate-x-1/2 justify-around rounded-full border border-white/20 bg-[#1b0830]/90 py-2 shadow-arcade md:hidden">
          <Link to="/torneos">🏆</Link>
          <Link to="/unirse">📷</Link>
          <Link to="/admin">🎛️</Link>
        </nav>
      )}
    </div>
  );
}

function navCls({ isActive }: { isActive: boolean }) {
  return `rounded-full px-4 py-2 text-sm font-black uppercase ${isActive ? "bg-neon-pink text-white" : "bg-white/10"}`;
}

export function BigButton({
  children,
  onClick,
  color = "bg-neon-gold",
  className = "",
  disabled,
  type = "button",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  color?: string;
  className?: string;
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  return (
    <motion.button
      type={type}
      disabled={disabled}
      whileTap={disabled ? undefined : { scale: 0.96, y: 4 }}
      onClick={onClick}
      className={`btn-arcade ${color} ${className} disabled:opacity-40`}
    >
      {children}
    </motion.button>
  );
}

export function Title({ icon, text, sub }: { icon?: React.ReactNode; text: string; sub?: string }) {
  return (
    <div className="mb-6">
      <h1 className="flex items-center gap-2 font-display text-3xl text-white sm:text-5xl">
        {icon ?? <Trophy className="text-neon-gold" />} {text}
      </h1>
      {sub && <p className="mt-2 max-w-2xl text-white/80">{sub}</p>}
    </div>
  );
}

export function Flash({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ y: 16, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="card-arcade flex items-center gap-3 border-neon-gold/50"
    >
      <Sparkles className="text-neon-gold" />
      <p className="font-black">{children}</p>
    </motion.div>
  );
}
