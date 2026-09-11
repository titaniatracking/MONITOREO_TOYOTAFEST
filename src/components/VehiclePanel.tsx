import { Crosshair, MapPinned, Navigation, Route, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { VehicleSearchRecord, VehicleTelemetry } from "../types";
import { apiUrl } from "../utils/api";
import { corridorLabel, statusLabel } from "../utils/labels";

interface VehiclePanelProps {
  vehicle: VehicleTelemetry | VehicleSearchRecord | null;
  follow: boolean;
  onClose: () => void;
  onFollow: () => void;
  onCenterVehicle: () => void;
  onCenterEvent: () => void;
}

interface RoutePoint {
  lat: number;
  lng: number;
  speed: number;
  heading?: number;
  timestamp: number;
  time: string;
}

export function VehiclePanel({ vehicle, follow, onClose, onFollow, onCenterVehicle, onCenterEvent }: VehiclePanelProps) {
  const [routeSummary, setRouteSummary] = useState<string | null>(null);
  const [routeEvents, setRouteEvents] = useState<RoutePoint[]>([]);
  const [routeLoading, setRouteLoading] = useState(false);

  if (!vehicle) return null;
  const isLive = Number.isFinite(Number((vehicle as VehicleTelemetry).lat)) && Number.isFinite(Number((vehicle as VehicleTelemetry).lng));
  const liveVehicle = isLive ? (vehicle as VehicleTelemetry) : null;
  const modelLabel = displayModel(vehicle);

  useEffect(() => {
    setRouteSummary(null);
    setRouteEvents([]);
  }, [vehicle.deviceId]);

  const loadTodayRoute = async () => {
    setRouteLoading(true);
    try {
      const response = await fetch(apiUrl(`/api/vehicles/${encodeURIComponent(vehicle.deviceId)}/route/today`));
      const data = await response.json();
      const summary = data.summary;
      const points = Array.isArray(data.points) ? (data.points as RoutePoint[]) : [];
      setRouteSummary(
        summary?.totalPoints
          ? `${summary.totalPoints} puntos hoy. Primera senal ${summary.firstTime || "--"}, ultima ${summary.lastTime || "--"}, ${summary.movingPoints} puntos en movimiento, velocidad maxima ${Number(summary.maxSpeed || 0).toFixed(0)} km/h.`
          : "Sin posiciones guardadas hoy para este vehiculo."
      );
      setRouteEvents(compactRouteEvents(points));
    } catch {
      setRouteSummary("No se pudo cargar el recorrido de hoy.");
      setRouteEvents([]);
    } finally {
      setRouteLoading(false);
    }
  };

  return (
    <aside className="vehicle-panel">
      <button className="icon-close" onClick={onClose} aria-label="Close target panel">
        <X size={17} />
      </button>
      <p className="eyebrow">VEHICULO EN VIVO</p>
      <h2>{vehicle.plate}</h2>
      <span className={`status-pill status-${(vehicle.status ?? "OFFLINE").toLowerCase()}`}>{liveVehicle ? statusLabel(liveVehicle.status) : "Registro base central"}</span>
      <p className="vehicle-model">{modelLabel}</p>
      <p className="vehicle-owner">{vehicle.owner && vehicle.owner !== "Dato real" ? vehicle.owner : "Cliente pendiente en base"}</p>

      <div className="telemetry-grid">
        <Datum label="MODELO" value={modelLabel} />
        <Datum label="CLIENTE" value={vehicle.owner && vehicle.owner !== "Dato real" ? vehicle.owner : "PENDIENTE"} />
        <Datum label="CEDULA / RUC" value={vehicle.document || "PENDIENTE"} />
        <Datum label="CHASIS" value={vehicle.chassis || "PENDIENTE"} />
        <Datum label="IMEI" value={vehicle.imei || vehicle.deviceId || "PENDIENTE"} />
        <Datum label="SIM" value={vehicle.sim || "PENDIENTE"} />
        <Datum label="DEALER" value={vehicle.dealer || "PENDIENTE"} />
        <Datum label="CODIGO DEALER" value={vehicle.dealerCode || "PENDIENTE"} />
        <Datum label="PLATAFORMA" value={vehicle.platform || "PENDIENTE"} />
        <Datum label="TIPO DISPOSITIVO" value={vehicle.deviceType || "PENDIENTE"} />
        <Datum label="RED" value={vehicle.networkType || "PENDIENTE"} />
        <Datum label="TIPO SIM" value={vehicle.simType || "PENDIENTE"} />
        <Datum label="FASE" value={vehicle.phase || "PENDIENTE"} />
        <Datum label="BENEFICIO" value={vehicle.benefit || "PENDIENTE"} />
        <Datum label="TELEFONO" value={vehicle.phone || "PENDIENTE"} />
        <Datum label="EMAIL" value={vehicle.email || "PENDIENTE"} />
        <Datum label="COLOR" value={vehicle.color || "PENDIENTE"} />
        <Datum label="MOTOR" value={vehicle.engine || "PENDIENTE"} />
        <Datum label="VIGENCIA" value={vehicle.endDate || "PENDIENTE"} />
        <Datum label="ESTADO SERVICIO" value={vehicle.serviceStatus || "PENDIENTE"} />
        <Datum label="VELOCIDAD" value={liveVehicle ? `${liveVehicle.speed} km/h` : "SIN POSICION"} />
        <Datum label="RUMBO" value={liveVehicle ? `${Math.round(liveVehicle.heading)} grados` : "SIN POSICION"} />
        <Datum label="DISTANCIA" value={liveVehicle ? `${liveVehicle.distanceToEvent.toFixed(1)} km` : "SIN POSICION"} />
        <Datum label="ETA" value={liveVehicle?.etaToEvent ? `${liveVehicle.etaToEvent} min` : "NO DISPONIBLE"} />
        <Datum label="GPS" value={liveVehicle ? `${liveVehicle.satellites} SAT` : "SIN POSICION"} />
        <Datum label="ENCENDIDO" value={liveVehicle ? (liveVehicle.ignition ? "ON" : "OFF") : "SIN POSICION"} />
        <Datum label="CORREDOR" value={liveVehicle ? corridorLabel(liveVehicle.approachCorridor) : "SIN POSICION"} />
        <Datum label="ULTIMO EVENTO" value={liveVehicle ? statusLabel(liveVehicle.status) : "SIN POSICION ACTUAL"} />
      </div>

      <div className="panel-actions">
        <button onClick={onCenterVehicle} disabled={!liveVehicle}><MapPinned size={16} />UBICAR EN MAPA</button>
        <button onClick={onFollow} disabled={!liveVehicle}><Crosshair size={16} />{follow ? "DEJAR DE SEGUIR" : "SEGUIR VEHICULO"}</button>
        <button onClick={loadTodayRoute} disabled={!vehicle.deviceId}><Route size={16} />{routeLoading ? "CARGANDO RUTA" : "VER RUTA DE HOY"}</button>
        <button disabled={!liveVehicle}><Navigation size={16} />REPRODUCIR</button>
        <button onClick={onCenterEvent}><MapPinned size={16} />CENTRAR EVENTO</button>
      </div>

      {routeSummary && <div className="daily-route-text">{routeSummary}</div>}

      {routeEvents.length > 0 && (
        <div className="daily-events">
          <strong>EVENTOS DEL DIA</strong>
          {routeEvents.map((event, index) => (
            <span key={`${event.timestamp}-${index}`}>
              <b>{event.time || new Date(Number(event.timestamp)).toLocaleTimeString("es-EC", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</b>
              <small>{Number(event.speed || 0).toFixed(0)} km/h / {Number(event.lat).toFixed(5)}, {Number(event.lng).toFixed(5)}</small>
            </span>
          ))}
        </div>
      )}
    </aside>
  );
}

function displayModel(vehicle: VehicleTelemetry | VehicleSearchRecord) {
  const model = String(vehicle.model || "").trim();
  const isTechnicalId = /^\d{5,}$/.test(model);
  const isGeneric = ["VEHICULO", "VEHICULO TOYOTA", "TOYOTA"].includes(model.toUpperCase());
  if (model && !isTechnicalId && !isGeneric) return model;

  const fallback = [vehicle.brand, vehicle.year].filter(Boolean).join(" ").trim();
  return fallback || "MODELO PENDIENTE";
}

function compactRouteEvents(points: RoutePoint[]) {
  if (points.length <= 60) return points;
  const step = Math.ceil(points.length / 60);
  const sampled = points.filter((_point, index) => index % step === 0);
  const last = points[points.length - 1];
  return sampled[sampled.length - 1]?.timestamp === last.timestamp ? sampled : [...sampled, last];
}

function Datum({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <small>{label}</small>
      <strong>{value}</strong>
    </div>
  );
}
