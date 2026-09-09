import type { VehicleTelemetry } from "../utils/telemetry";

export interface TraccarConfig {
  baseUrl: string;
  username: string;
  password: string;
}

interface TraccarDevice {
  id: number;
  name?: string;
  uniqueId?: string;
  status?: string;
  positionId?: number;
  lastUpdate?: string;
  model?: string;
  contact?: string;
}

interface TraccarPosition {
  id: number;
  deviceId: number;
  latitude: number;
  longitude: number;
  speed?: number;
  course?: number;
  fixTime?: string;
  deviceTime?: string;
  serverTime?: string;
  attributes?: Record<string, unknown>;
}

export interface TraccarGeofence {
  id: number;
  name: string;
  description?: string;
  area: string;
}

const EVENT_CENTER = { lat: -0.0212638, lng: -78.4483948 };
const MAX_EVENT_DISTANCE_KM = 120;
const MAX_LIVE_VEHICLES = 300;

export class TraccarService {
  constructor(private readonly config: TraccarConfig) {}

  isConfigured() {
    return Boolean(this.config.baseUrl && this.config.username && this.config.password);
  }

  async getDevices() {
    return this.request<TraccarDevice[]>("/api/devices");
  }

  async getPositions() {
    return this.request<TraccarPosition[]>("/api/positions");
  }

  async getGeofence(id: number) {
    const geofences = await this.request<TraccarGeofence[]>("/api/geofences");
    return geofences.find((geofence) => geofence.id === id) ?? null;
  }

  async getLiveVehicles(): Promise<VehicleTelemetry[]> {
    if (!this.isConfigured()) return [];

    const [devices, positions] = await Promise.all([this.getDevices(), this.getPositions()]);
    const devicesById = new Map(devices.map((device) => [device.id, device]));

    return positions
      .map((position) => normalizeTraccarPosition(position, devicesById.get(position.deviceId)))
      .filter((vehicle): vehicle is VehicleTelemetry => Boolean(vehicle))
      .filter((vehicle) => distanceKm(vehicle.lat, vehicle.lng, EVENT_CENTER.lat, EVENT_CENTER.lng) <= MAX_EVENT_DISTANCE_KM)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, MAX_LIVE_VEHICLES);
  }

  async findLiveVehicleByTerms(terms: string[]) {
    if (!this.isConfigured()) return null;
    const normalizedTerms = terms.map(normalizeLookup).filter(Boolean);
    if (!normalizedTerms.length) return null;

    const [devices, positions] = await Promise.all([this.getDevices(), this.getPositions()]);
    const devicesById = new Map(devices.map((device) => [device.id, device]));

    return positions
      .map((position) => normalizeTraccarPosition(position, devicesById.get(position.deviceId)))
      .find((vehicle) => vehicle && matchesLookup(vehicle, normalizedTerms)) ?? null;
  }

  private async request<T>(path: string): Promise<T> {
    if (!this.isConfigured()) {
      throw new Error("TRACCAR credentials are required");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const response = await fetch(`${this.config.baseUrl}${path}`, {
      headers: {
        Authorization: `Basic ${Buffer.from(`${this.config.username}:${this.config.password}`).toString("base64")}`,
        Accept: "application/json",
      },
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    if (!response.ok) {
      throw new Error(`Traccar request failed: ${response.status}`);
    }

    return response.json() as Promise<T>;
  }
}

function normalizeTraccarPosition(position: TraccarPosition, device?: TraccarDevice): VehicleTelemetry | null {
  const lat = Number(position.latitude);
  const lng = Number(position.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const timestamp = Date.parse(position.fixTime ?? position.deviceTime ?? position.serverTime ?? "");
  const recordedAt = Number.isFinite(timestamp) ? timestamp : Date.now();
  const speedKmh = Number(position.speed ?? 0) * 1.852;
  const ignition = Boolean(position.attributes?.ignition ?? position.attributes?.motion ?? speedKmh > 0);
  const isOffline = Date.now() - recordedAt > 1000 * 60 * 10 || device?.status === "offline";

  return {
    deviceId: String(device?.uniqueId ?? position.deviceId),
    plate: normalizePlate(device?.name ?? device?.uniqueId ?? String(position.deviceId)),
    model: device?.model ?? device?.name ?? "Vehiculo Toyota",
    owner: device?.contact,
    document: textAttribute(position.attributes, ["document", "cedula", "dni", "ruc"]),
    chassis: textAttribute(position.attributes, ["chassis", "chasis", "vin"]),
    lat,
    lng,
    speed: Number(speedKmh.toFixed(1)),
    heading: Number(position.course ?? 0),
    ignition,
    satellites: Number(position.attributes?.sat ?? position.attributes?.satellites ?? 0),
    timestamp: recordedAt,
    status: isOffline ? "OFFLINE" : speedKmh > 0.5 ? "MOVING" : "STOPPED",
    source: "traccar",
    lookupIds: [String(device?.uniqueId ?? ""), String(position.deviceId)].filter(Boolean),
  };
}

function normalizePlate(value: string) {
  const plateCandidate = value.match(/[A-Z]{2,4}[-\s]?\d{3,4}/i)?.[0];
  return (plateCandidate ?? value).replace(/\s+/g, "").toUpperCase();
}

function textAttribute(attributes: Record<string, unknown> | undefined, keys: string[]) {
  if (!attributes) return undefined;
  for (const key of keys) {
    const value = attributes[key];
    if (value) return String(value);
  }
  return undefined;
}

function matchesLookup(vehicle: VehicleTelemetry, terms: string[]) {
  return [vehicle.deviceId, vehicle.plate, vehicle.model, vehicle.chassis, vehicle.imei, ...(vehicle.lookupIds ?? [])]
    .map(normalizeLookup)
    .some((value) => value && terms.includes(value));
}

function normalizeLookup(value: string | undefined) {
  return String(value ?? "").trim().replace(/[-_\s.]/g, "").toUpperCase();
}

function distanceKm(latA: number, lngA: number, latB: number, lngB: number) {
  const radiusKm = 6371;
  const dLat = toRad(latB - latA);
  const dLng = toRad(lngB - lngA);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(latA)) * Math.cos(toRad(latB)) * Math.sin(dLng / 2) ** 2;
  return 2 * radiusKm * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRad(value: number) {
  return (value * Math.PI) / 180;
}
