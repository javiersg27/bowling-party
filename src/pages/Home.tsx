import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { QrCode, Shield, Tv2, Users } from "lucide-react";
import { Title, BigButton } from "../ui/Shell";
import { useGame } from "../game/GameContext";
import { partyStore } from "../data/store";

export function HomePage() {
  const { liveReady, mode, switchMode, becomeAdmin, syncError } = useGame();
  const demo = partyStore.state.tournaments[0];

  return (
    <div>
      <Title text="¡A jugar!" sub="Torneos de bolos presenciales con equipos, pistas mixtas, modificadores arcade y finales al estilo de las copas de karts. Identidad original: cero personajes protegidos." />
      <motion.div
        initial={{ scale: 0.96, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="checker mb-8 overflow-hidden rounded-[2rem] border-4 border-neon-cyan/40 p-6"
      >
        <p className="font-display text-4xl text-neon-gold sm:text-6xl">BOWLING PARTY</p>
        <p className="mt-3 max-w-xl text-lg">
          Tres rondas. Caos con objetos en la primera, clasificatoria oficial en la segunda y gran final por grupos. La
          base de datos es la fuente de verdad; este modo demo usa un motor aislado claramente etiquetado.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link to="/admin/nuevo">
            <BigButton color="bg-neon-gold">Crear torneo</BigButton>
          </Link>
          <Link to="/unirse">
            <BigButton color="bg-neon-cyan">Unirme con código</BigButton>
          </Link>
          {demo && (
            <Link to={`/t/${demo.accessCode}/jugador`}>
              <BigButton color="bg-neon-pink text-white">Probar demo</BigButton>
            </Link>
          )}
        </div>
      </motion.div>
      <div className="grid gap-4 md:grid-cols-2">
        <Card icon={<Users />} title="Equipos ≠ pistas" text="Cada pista mezcla jugadores de distintos equipos. La puntuación del equipo suma a sus miembros, sin duplicar." />
        <Card icon={<Spark />} title="Objetos anti-liderazgo" text="Los últimos de cada pista tienen más opciones de objetos épicos. Los puntos oficiales de bolos nunca se pisan." />
        <Card icon={<QrCode />} title="Inscripción móvil" text="Código, enlace y QR. Entrada anónima, avatares y recuperación de sesión." />
        <Card icon={<Tv2 />} title="Modo proyector" text="Clasificación, strikes y objetos en una vista legible a distancia." />
      </div>
      <div className="mt-8 card-arcade">
        <p className="font-black uppercase text-neon-cyan">Fuente de datos</p>
        <p className="mt-2">
          Modo actual: <b>{mode === "demo" ? "demostración aislada" : "Supabase en vivo"}</b>.{" "}
          {liveReady
            ? "Hay credenciales públicas de Supabase. Puedes cambiar a vivo cuando el proyecto esté migrado."
            : "No hay .env.local de Supabase. El juego funciona en demo hasta que configures URL y clave anon."}
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <BigButton color="bg-white" onClick={() => switchMode("demo")}>
            Forzar demo
          </BigButton>
          <BigButton
            color="bg-neon-lime"
            disabled={!liveReady}
            onClick={() => {
              switchMode("live");
              becomeAdmin();
            }}
          >
            Intentar vivo
          </BigButton>
          <Link to="/admin">
            <BigButton color="bg-neon-violet text-white" onClick={() => becomeAdmin()}>
              <Shield size={18} /> Entrar como dirección (demo)
            </BigButton>
          </Link>
        </div>
        {syncError && (
          <p className="mt-4 rounded-2xl border-2 border-neon-pink bg-neon-pink/10 p-3 text-sm">
            <b>No se pudo sincronizar con la nube:</b> {syncError}
          </p>
        )}
      </div>
    </div>
  );
}

function Spark() {
  return <span className="text-2xl">⭐</span>;
}

function Card({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="card-arcade">
      <div className="mb-2 text-neon-gold">{icon}</div>
      <h2 className="font-display text-2xl">{title}</h2>
      <p className="mt-2 text-white/80">{text}</p>
    </div>
  );
}
