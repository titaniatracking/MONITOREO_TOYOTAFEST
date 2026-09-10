import { useEffect, useMemo, useRef, useState } from "react";
import type { ActivityEvent, GeoPoint, VehicleApiResponse, VehicleStatus, VehicleTelemetry } from "../types";
import { apiUrl } from "../utils/api";
import { bearingDeg, corridorFor, distanceKm, etaMinutes, EVENT_CENTER, EVENT_POLYGON, isInsideEventGeofence } from "../utils/geo";
import { statusLabel } from "../utils/labels";

export function useToyotaRadar() {
  const [vehicles, setVehicles] = useState<VehicleTelemetry[]>([]);
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [lastUpdate, setLastUpdate] = useState(() => new Date());
  const [source, setSource] = useState<VehicleApiResponse["source"]>("database");
  const [loadingRealData, setLoadingRealData] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [eventPolygon, setEventPolygon] = useState<GeoPoint[]>(EVENT_POLYGON);
  const eventPolygonRef = useRef<GeoPoint[]>(EVENT_POLYGON);

  useEffect(() => {
    let cancelled = false;

    const loadEventGeofence = async () => {
      try {
        const response = await fetch(apiUrl("/api/geofence/event"));
        const data = (await response.json()) as { points?: GeoPoint[] };
        if (!cancelled && response.ok && Array.isArray(data.points) && data.points.length >= 3) {
          eventPolygonRef.current = data.points;
          setEventPolygon(data.points);
        }
      } catch {
        // El poligono exacto incluido en la aplicacion permanece como respaldo.
      }
    };

    loadEventGeofence();
    const timer = window.setInterval(loadEventGeofence, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadRealVehicles = async () => {
      try {
        const data = await loadVehicleResponse();
        if (cancelled) return;

        setSource(data.source);
        setLastUpdate(new Date());
        setVehicles((current) => {
          const incoming = data.vehicles || [];
          if (!incoming.length && current.length) return current;

          const merged = mergeRealVehicles(current, incoming, eventPolygonRef.current);
          setEvents(buildLiveEvents(merged));
          return merged;
        });
        setError(null);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "No se pudo conectar con backend");
      } finally {
        if (!cancelled) setLoadingRealData(false);
      }
    };

    loadRealVehicles();
    const timer = window.setInterval(loadRealVehicles, 10000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const stats = useMemo(() => {
    const count = (status: VehicleStatus) => vehicles.filter((vehicle) => vehicle.status === status).length;
    return {
      online: vehicles.filter((vehicle) => vehicle.status !== "OFFLINE").length,
      moving: count("MOVING"),
      approaching: count("APPROACHING"),
      arriving: count("ARRIVING"),
      atEvent: count("AT_EVENT"),
      stopped: count("STOPPED"),
      departing: count("DEPARTING"),
      offline: count("OFFLINE"),
      activeTracks: vehicles.reduce((total, vehicle) => total + vehicle.trail.length, 0),
    };
  }, [vehicles]);

  return { vehicles, events, stats, lastUpdate, source, loadingRealData, error, eventPolygon };
}

function mergeRealVehicles(current: VehicleTelemetry[], incoming: Partial<VehicleTelemetry>[], eventPolygon: GeoPoint[]) {
  const byId = new Map(current.map((vehicle) => [vehicle.deviceId || vehicle.id, vehicle]));

  const merged = incoming
    .filter((vehicle) => Number.isFinite(Number(vehicle.lat)) && Number.isFinite(Number(vehicle.lng)))
    .map((vehicle, index) => {
      const id = vehicle.deviceId || vehicle.id || `vehiculo-real-${index}`;
      const previous = byId.get(id);
      const point = { lat: Number(vehicle.lat), lng: Number(vehicle.lng) };
      const distanceToEvent = distanceKm(point, EVENT_CENTER);
      const speed = Number(vehicle.speed || 0);
      const timestamp = Number(vehicle.timestamp || Date.now());
      const status = normalizeStatus(vehicle.status, point, eventPolygon, distanceToEvent, speed, timestamp);
      const plate = safeDisplayPlate(String(vehicle.plate || ""));
      const model = safeDisplayModel(String(vehicle.model || "Toyota"), plate);
      const trail = previous ? [...previous.trail, point].slice(-32) : [point];

      return {
        id,
        deviceId: String(vehicle.deviceId || id),
        lookupIds: vehicle.lookupIds,
        plate,
        model,
        owner: String(vehicle.owner || "Dato real"),
        document: vehicle.document ? String(vehicle.document) : undefined,
        chassis: vehicle.chassis ? String(vehicle.chassis) : undefined,
        imei: vehicle.imei ? String(vehicle.imei) : undefined,
        sim: vehicle.sim ? String(vehicle.sim) : undefined,
        brand: vehicle.brand ? String(vehicle.brand) : undefined,
        year: vehicle.year,
        color: vehicle.color ? String(vehicle.color) : undefined,
        engine: vehicle.engine ? String(vehicle.engine) : undefined,
        dealer: vehicle.dealer ? String(vehicle.dealer) : undefined,
        dealerCode: vehicle.dealerCode ? String(vehicle.dealerCode) : undefined,
        serviceStatus: vehicle.serviceStatus ? String(vehicle.serviceStatus) : undefined,
        installationDate: vehicle.installationDate ? String(vehicle.installationDate) : undefined,
        startDate: vehicle.startDate ? String(vehicle.startDate) : undefined,
        endDate: vehicle.endDate ? String(vehicle.endDate) : undefined,
        lat: point.lat,
        lng: point.lng,
        speed,
        heading: Number.isFinite(Number(vehicle.heading)) ? Number(vehicle.heading) : previous ? bearingDeg(previous, point) : 0,
        ignition: Boolean(vehicle.ignition),
        satellites: Number(vehicle.satellites || 0),
        timestamp,
        status,
        distanceToEvent,
        etaToEvent: etaMinutes(distanceToEvent, speed),
        approachCorridor: corridorFor(point),
        trail,
        route: previous ? [...previous.route, point].slice(-90) : [point],
        lastEvent: statusLabel(status),
      };
    });

  const refreshedIds = new Set(merged.map((vehicle) => vehicle.deviceId || vehicle.id));
  const retainedAtEvent = current.filter(
    (vehicle) => vehicle.status === "AT_EVENT" && !refreshedIds.has(vehicle.deviceId || vehicle.id)
  );

  return [...merged, ...retainedAtEvent];
}

function safeDisplayPlate(value: string) {
  const clean = value.trim().replace(/\s+/g, "").toUpperCase();
  if (clean === "SINPLACA") return "SIN PLACA";
  if (!clean || /^\d{10,}$/.test(clean)) return "SIN PLACA";
  if (/^\d{5,9}$/.test(clean)) return "SIN PLACA";
  return clean;
}

function safeDisplayModel(value: string, plate: string) {
  const clean = value.trim();
  if (!clean || clean.replace(/\s+/g, "").toUpperCase() === plate) return "Vehiculo Toyota";
  if (/^\d{10,}$/.test(clean)) return "Vehiculo Toyota";
  return clean;
}

async function loadVehicleResponse() {
  try {
    return await fetchVehicles(apiUrl("/api/vehicles/live"), 18000);
  } catch {
    return fetchVehicles(apiUrl("/api/vehicles"), 6000, "database");
  }
}

async function fetchVehicles(url: string, timeoutMs: number, fallbackSource?: VehicleApiResponse["source"]) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { signal: controller.signal });
    const data = (await response.json()) as Partial<VehicleApiResponse> & { error?: string };
    if (!response.ok) throw new Error(data.error || "No se pudo leer vehiculos reales");
    return {
      source: data.source ?? fallbackSource ?? "database",
      vehicles: data.vehicles ?? [],
    } satisfies VehicleApiResponse;
  } finally {
    window.clearTimeout(timeout);
  }
}

function normalizeStatus(status: VehicleStatus | undefined, point: GeoPoint, eventPolygon: GeoPoint[], distanceToEvent: number, speed: number, timestamp: number): VehicleStatus {
  if (Date.now() - timestamp > 1000 * 60 * 5 || status === "OFFLINE") return "OFFLINE";
  if (isInsideEventGeofence(point, eventPolygon)) return "AT_EVENT";
  if (distanceToEvent < 1.2) return "ARRIVING";
  if (distanceToEvent < 10 && speed > 3) return "APPROACHING";
  if (speed < 2) return "STOPPED";
  return "MOVING";
}

function buildLiveEvents(vehicles: VehicleTelemetry[]): ActivityEvent[] {
  return vehicles
    .slice()
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 20)
    .map((vehicle) => ({
      id: `${vehicle.id}-${vehicle.timestamp}-${vehicle.status}`,
      time: new Date(vehicle.timestamp).toLocaleTimeString("es-EC", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" }),
      plate: vehicle.plate,
      type: statusLabel(vehicle.status),
      detail: `${vehicle.distanceToEvent.toFixed(1)} km / ${vehicle.speed.toFixed(0)} km/h`,
      status: vehicle.status,
    }));
}
