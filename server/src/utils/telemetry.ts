export type VehicleStatus = "APPROACHING" | "ARRIVING" | "AT_EVENT" | "MOVING" | "STOPPED" | "DEPARTING" | "OFFLINE";

export interface VehicleTelemetry {
  deviceId: string;
  plate?: string;
  model?: string;
  owner?: string;
  document?: string;
  chassis?: string;
  imei?: string;
  sim?: string;
  brand?: string;
  year?: string | number;
  color?: string;
  engine?: string;
  dealer?: string;
  dealerCode?: string;
  serviceStatus?: string;
  phone?: string;
  email?: string;
  address?: string;
  platform?: string;
  deviceType?: string;
  networkType?: string;
  simType?: string;
  phase?: string;
  benefit?: string;
  installationDate?: string;
  startDate?: string;
  endDate?: string;
  lat: number;
  lng: number;
  speed: number;
  heading?: number;
  ignition?: boolean;
  satellites?: number;
  timestamp: number;
  status: VehicleStatus;
  distanceToEvent?: number;
  etaToEvent?: number;
  approachCorridor?: string;
  source?: "flespi" | "traccar";
  lookupIds?: string[];
}

export function normalizeFlespiTelemetry(deviceId: string, payload: Record<string, unknown>): VehicleTelemetry | null {
  const lat = Number(payload["position.latitude"]);
  const lng = Number(payload["position.longitude"]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const timestamp = Number(payload.timestamp ?? Date.now() / 1000) * 1000;
  const isOffline = Date.now() - timestamp > 1000 * 60 * 5;
  const speed = Number(payload["position.speed"] ?? 0);

  return {
    deviceId,
    plate: String(payload.ident ?? deviceId),
    lat,
    lng,
    speed,
    heading: Number(payload["position.direction"] ?? 0),
    ignition: Boolean(payload["engine.ignition.status"]),
    satellites: Number(payload["gps.satellites"] ?? 0),
    timestamp,
    status: isOffline ? "OFFLINE" : speed > 0 ? "MOVING" : "STOPPED",
  };
}
