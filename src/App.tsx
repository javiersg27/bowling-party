import { Navigate, Route, Routes } from "react-router-dom";
import { Shell } from "./ui/Shell";
import { HomePage } from "./pages/Home";
import { TournamentsPage } from "./pages/Tournaments";
import { JoinPage } from "./pages/Join";
import { PlayerPage } from "./pages/Player";
import { LaneViewPage } from "./pages/LaneView";
import { StandingsPage } from "./pages/Standings";
import { AdminHome, AdminTournamentPage, CreateTournamentPage } from "./pages/Admin";
import { SpectatorPage } from "./pages/Spectator";
import { FinalsPage, HubPage } from "./pages/Finals";

export default function App() {
  return (
    <Shell>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/torneos" element={<TournamentsPage />} />
        <Route path="/unirse" element={<JoinPage />} />
        <Route path="/unirse/:code" element={<JoinPage />} />
        <Route path="/admin" element={<AdminHome />} />
        <Route path="/admin/nuevo" element={<CreateTournamentPage />} />
        <Route path="/admin/t/:id" element={<AdminTournamentPage />} />
        <Route path="/t/:code" element={<HubPage />} />
        <Route path="/t/:code/jugador" element={<PlayerPage />} />
        <Route path="/t/:code/pista/:laneId" element={<LaneViewPage />} />
        <Route path="/t/:code/clasificacion" element={<StandingsPage />} />
        <Route path="/t/:code/spectator" element={<SpectatorPage />} />
        <Route path="/t/:code/finales" element={<FinalsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Shell>
  );
}
