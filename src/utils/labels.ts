import type { Corridor, VehicleStatus } from "../types";

export function statusLabel(status: VehicleStatus) {
  return {
    APPROACHING: "EN APROXIMACION",
    ARRIVING: "INGRESANDO",
    AT_EVENT: "EN EVENTO",
    MOVING: "EN MOVIMIENTO",
    STOPPED: "DETENIDO",
    DEPARTING: "SALIENDO",
    OFFLINE: "SIN SENAL",
  }[status];
}

export function corridorLabel(corridor?: Corridor) {
  if (!corridor) return "SIN CORREDOR";
  return {
    NORTH: "CORREDOR NORTE",
    EAST: "CORREDOR ESTE",
    SOUTH: "CORREDOR SUR",
    WEST: "CORREDOR OESTE",
  }[corridor];
}
