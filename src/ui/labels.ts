import type { TournamentStatus } from "../domain/types";

export const STATUS_LABEL: Record<TournamentStatus, string> = {
  draft: "Borrador",
  registration: "Inscripciones abiertas",
  ready: "Preparado",
  round_1: "Primera ronda",
  round_2: "Segunda ronda",
  round_3: "Tercera ronda",
  finished: "Finalizado",
  archived: "Archivado",
  paused: "En pausa",
  cancelled: "Cancelado",
};

export const ROUND_NAME = {
  1: "Ronda 1 · Caos en la bolera",
  2: "Ronda 2 · Clasificatoria",
  3: "Ronda 3 · Gran final",
};
