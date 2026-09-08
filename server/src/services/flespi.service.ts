export interface FlespiConfig {
  token: string;
  baseUrl: string;
}

const EVENT_CENTER = { lat: -0.0212638, lng: -78.4483948 };
const MAX_EVENT_DISTANCE_KM = 120;
const MAX_LIVE_VEHICLES = 300;

export class FlespiService {
  constructor(private readonly config: FlespiConfig) {}

  private headers() {
    return {
      Authorization: `FlespiToken ${this.config.token}`,
      "Content-Type": "application/json",
    };
  }

  async getDevices() {
    return this.request("/devices/all");
  }

  async getDeviceTelemetry(deviceIds: string[]) {
    return this.request(`/devices/${deviceIds.join(",")}/telemetry/all`);
  }

  async getDevicePosition(deviceId: string) {
    return this.request(`/devices/${deviceId}/telemetry/position.latitude,position.longitude,position.speed,position.direction`);
  }

  async getDeviceHistory(deviceId: string, data: unknown) {
    const query = encodeURIComponent(JSON.stringify(data));
    return this.request(`/devices/${deviceId}/messages?data=${query}`);
  }

  async getTrips(deviceId: string) {
    return this.request(`/devices/${deviceId}/gw/calcs/all/intervals/all`);
  }

  async getMessages(deviceId: string, data: unknown) {
    return this.getDeviceHistory(deviceId, data);
  }

  async getDeviceStatus(deviceId: string) {
    return this.request(`/devices/${deviceId}/telemetry/timestamp,engine.ignition.status,gps.satellites`);
  }

  async getLiveVehicles() {
    const deviceResponse = await this.getDevices();
    const devices = extractArray(deviceResponse);
    const ids = devices.map((device) => String(device.id ?? device["device.id"] ?? "")).filter(Boolean);
    if (!ids.length) return [];

    const telemetryResponse = await this.getDeviceTelemetry(ids.slice(0, 1000));
    const telemetryRows = extractArray(telemetryResponse);
    return telemetryRows
      .map((row) => normalizeTelemetryRow(row))
      .filter((vehicle): vehicle is NonNullable<ReturnType<typeof normalizeTelemetryRow>> => Boolean(vehicle))
      .filter((vehicle) => distanceKm(vehicle.lat, vehicle.lng, EVENT_CENTER.lat, EVENT_CENTER.lng) <= MAX_EVENT_DISTANCE_KM)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, MAX_LIVE_VEHICLES);
  }

  async findLiveVehicleByTerms(terms: string[]) {
    const normalizedTerms = terms.map(normalizeLookup).filter(Boolean);
    if (!normalizedTerms.length) return null;

    const deviceResponse = await this.getDevices();
    const devices = extractArray(deviceResponse);
    const ids = devices.map((device) => String(device.id ?? device["device.id"] ?? "")).filter(Boolean);

    for (let index = 0; index < ids.length; index += 450) {
      const telemetryResponse = await this.getDeviceTelemetry(ids.slice(index, index + 450));
      const telemetryRows = extractArray(telemetryResponse);
      const found = telemetryRows
        .map((row) => normalizeTelemetryRow(row))
        .find((vehicle) => vehicle && matchesLookup(vehicle, normalizedTerms));

      if (found) return found;
    }

    return null;
  }

  private async request(path: string) {
    if (!this.config.token) {
      throw new Error("FLESPI_TOKEN is required");
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const response = await fetch(`${this.config.baseUrl}${path}`, { headers: this.headers(), signal: controller.signal }).finally(() => clearTimeout(timeout));
    if (!response.ok) {
      throw new Error(`Flespi request failed: ${response.status}`);
    }
    return response.json();
  }
}

function extractArray(payload: unknown): Array<Record<string, any>> {
  if (Array.isArray(payload)) return payload as Array<Record<string, any>>;
  if (Array.isArray((payload as any)?.result)) return (payload as any).result;
  if (Array.isArray((payload as any)?.data)) return (payload as any).data;
  return [];
}

function valueFromTelemetry(payload: Record<string, any>, key: string) {
  const raw = payload[key];
  if (raw && typeof raw === "object" && "value" in raw) return raw.value;
  return raw;
}

function normalizeTelemetryRow(row: Record<string, any>) {
  const deviceId = String(row.id ?? row.device_id ?? row["device.id"] ?? "");
  const telemetry = row.telemetry && typeof row.telemetry === "object" ? row.telemetry : row;
  const lat = Number(valueFromTelemetry(telemetry, "position.latitude"));
  const lng = Number(valueFromTelemetry(telemetry, "position.longitude"));
  if (!deviceId || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const timestampValue = Number(valueFromTelemetry(telemetry, "timestamp") ?? Date.now() / 1000);
  const speed = Number(valueFromTelemetry(telemetry, "position.speed") ?? 0);
  const timestamp = timestampValue > 10_000_000_000 ? timestampValue : timestampValue * 1000;
  const ident = String(valueFromTelemetry(telemetry, "ident") ?? "");

  return {
    deviceId,
    plate: ident || String(row.name ?? deviceId),
    model: String(row.name ?? "Toyota"),
    lat,
    lng,
    speed,
    heading: Number(valueFromTelemetry(telemetry, "position.direction") ?? 0),
    ignition: Boolean(valueFromTelemetry(telemetry, "engine.ignition.status")),
    satellites: Number(valueFromTelemetry(telemetry, "gps.satellites") ?? 0),
    timestamp,
    status: Date.now() - timestamp > 1000 * 60 * 5 ? "OFFLINE" : speed > 0 ? "MOVING" : "STOPPED",
    source: "flespi",
    lookupIds: [deviceId, ident, String(row.name ?? "")].filter(Boolean),
  };
}

function matchesLookup(vehicle: NonNullable<ReturnType<typeof normalizeTelemetryRow>>, terms: string[]) {
  return [vehicle.deviceId, vehicle.plate, vehicle.model, ...(vehicle.lookupIds ?? [])]
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
