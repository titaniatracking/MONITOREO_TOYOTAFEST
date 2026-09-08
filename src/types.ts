export type VehicleStatus =
  | "APPROACHING"
  | "ARRIVING"
  | "AT_EVENT"
  | "MOVING"
  | "STOPPED"
  | "DEPARTING"
  | "OFFLINE";

export type Corridor = "NORTH" | "EAST" | "SOUTH" | "WEST";

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface VehicleTelemetry extends GeoPoint {
  id: string;
  plate: string;
  deviceId: string;
  model: string;
  owner: string;
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
  speed: number;
  heading: number;
  ignition: boolean;
  satellites: number;
  timestamp: number;
  status: VehicleStatus;
  distanceToEvent: number;
  etaToEvent?: number;
  approachCorridor?: Corridor;
  trail: GeoPoint[];
  route: GeoPoint[];
  lastEvent: string;
}

export interface VehicleApiResponse {
  source: "flespi" | "traccar" | "database";
  vehicles: VehicleTelemetry[];
}

export interface ActivityEvent {
  id: string;
  time: string;
  plate: string;
  type: string;
  detail: string;
  status: VehicleStatus;
}

export interface VehicleSearchRecord {
  id: string;
  deviceId: string;
  plate: string;
  model: string;
  owner: string;
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
  lat?: number;
  lng?: number;
  speed?: number;
  heading?: number;
  satellites?: number;
  ignition?: boolean;
  timestamp?: number;
  status?: VehicleStatus;
}
