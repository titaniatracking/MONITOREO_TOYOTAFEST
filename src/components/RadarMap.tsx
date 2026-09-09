import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, PointerEvent } from "react";
import { LocateFixed, Minus, Plus } from "lucide-react";
import type { GeoPoint, VehicleTelemetry } from "../types";
import { boundsFromCenter, clamp, EVENT_CENTER, getQuitoTiles, projectToMap, projectToMapRaw } from "../utils/geo";
import { corridorLabel, statusLabel } from "../utils/labels";

interface RadarMapProps {
  vehicles: VehicleTelemetry[];
  eventPolygon: GeoPoint[];
  selectedId?: string;
  radarMode: boolean;
  cinematicMode: boolean;
  showHeatmap: boolean;
  locatingVehicle: boolean;
  eventFocusKey: number;
  selectedFocusKey: number;
  onSelect: (vehicle: VehicleTelemetry) => void;
}

const rings = [1, 2, 5, 10];
const PAN_LIMIT = { lat: 0.18, lng: 0.22 };
const MIN_MAP_ZOOM = 11;
const MAX_MAP_ZOOM = 20;
const EVENT_FOCUS_ZOOM = 18;
const SELECTED_FOCUS_ZOOM = 18;
interface DragState {
  x: number;
  y: number;
  center: typeof EVENT_CENTER;
}

export function RadarMap({ vehicles, eventPolygon, selectedId, radarMode, cinematicMode, showHeatmap, locatingVehicle, eventFocusKey, selectedFocusKey, onSelect }: RadarMapProps) {
  const [mapZoom, setMapZoom] = useState(13);
  const [mapCenter, setMapCenter] = useState(EVENT_CENTER);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const mapBounds = useMemo(() => boundsFromCenter(mapCenter, mapZoom), [mapCenter, mapZoom]);
  const eventPoint = projectToMap(EVENT_CENTER, mapBounds);
  const selected = vehicles.find((vehicle) => vehicle.id === selectedId);
  const mapTiles = useMemo(() => getQuitoTiles(Math.round(mapZoom), mapBounds), [mapBounds, mapZoom]);
  const eventGeofenceCenter = useMemo(() => ({
    lat: eventPolygon.reduce((total, point) => total + point.lat, 0) / eventPolygon.length,
    lng: eventPolygon.reduce((total, point) => total + point.lng, 0) / eventPolygon.length,
  }), [eventPolygon]);
  const geofencePoints = useMemo(() => eventPolygon.map((point) => projectToMap(point, mapBounds)), [eventPolygon, mapBounds]);
  const geofenceLabel = useMemo(
    () => ({
      x: geofencePoints.reduce((total, point) => total + point.x, 0) / geofencePoints.length,
      y: geofencePoints.reduce((total, point) => total + point.y, 0) / geofencePoints.length,
    }),
    [geofencePoints]
  );
  const visibleVehicles = useMemo(
    () =>
      vehicles.filter((vehicle) => {
        const point = projectToMapRaw(vehicle, mapBounds);
        return point.x >= -8 && point.x <= 108 && point.y >= -8 && point.y <= 108;
      }),
    [mapBounds, vehicles]
  );
  const worldStyle = dragOffset.x || dragOffset.y ? ({ transform: `translate(${dragOffset.x}px, ${dragOffset.y}px)` } as CSSProperties) : undefined;

  const closest = useMemo(
    () => vehicles.filter((vehicle) => vehicle.status === "APPROACHING").sort((a, b) => a.distanceToEvent - b.distanceToEvent)[0],
    [vehicles]
  );

  useEffect(() => {
    if (!selected) return;
    setMapCenter({ lat: selected.lat, lng: selected.lng });
    setMapZoom((zoom) => Math.max(SELECTED_FOCUS_ZOOM, zoom));
  }, [selected?.id, selectedFocusKey]);

  useEffect(() => {
    if (!eventFocusKey) return;
    setMapCenter(eventGeofenceCenter);
    setMapZoom(EVENT_FOCUS_ZOOM);
  }, [eventFocusKey]);

  const commitPan = (event: PointerEvent<HTMLElement>) => {
    if (!dragState) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const startBounds = boundsFromCenter(dragState.center, mapZoom);
    const latSpan = startBounds.north - startBounds.south;
    const lngSpan = startBounds.east - startBounds.west;
    const nextCenter = {
      lat: clamp(dragState.center.lat + (dragOffset.y / rect.height) * latSpan, EVENT_CENTER.lat - PAN_LIMIT.lat, EVENT_CENTER.lat + PAN_LIMIT.lat),
      lng: clamp(dragState.center.lng - (dragOffset.x / rect.width) * lngSpan, EVENT_CENTER.lng - PAN_LIMIT.lng, EVENT_CENTER.lng + PAN_LIMIT.lng),
    };

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    setMapCenter(nextCenter);
    setDragState(null);
    setDragOffset({ x: 0, y: 0 });
  };

  return (
    <section
      className={`radar-map ${radarMode ? "radar-active" : ""} ${cinematicMode ? "cinematic-active" : ""} ${dragState ? "dragging" : ""}`}
      onPointerDown={(event) => {
        if ((event.target as HTMLElement).closest(".map-zoom-controls, .vehicle-target")) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        setDragState({ x: event.clientX, y: event.clientY, center: mapCenter });
      }}
      onPointerMove={(event) => {
        if (!dragState) return;
        setDragOffset({ x: event.clientX - dragState.x, y: event.clientY - dragState.y });
      }}
      onPointerUp={commitPan}
      onPointerCancel={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
        setDragState(null);
        setDragOffset({ x: 0, y: 0 });
      }}
      onWheel={(event) => {
        event.preventDefault();
        setMapZoom((zoom) => Math.max(MIN_MAP_ZOOM, Math.min(MAX_MAP_ZOOM, zoom + (event.deltaY < 0 ? 1 : -1))));
      }}
    >
      <div className="map-world" style={worldStyle}>
        <div className="quito-map-tiles" aria-label="Mapa de Quito">
          {mapTiles.map((tile) => (
            <img
              key={tile.key}
              src={tile.url}
              alt=""
              draggable={false}
              style={{ left: `${tile.left}%`, top: `${tile.top}%`, width: `${tile.width}%`, height: `${tile.height}%` }}
            />
          ))}
        </div>
        <div className="map-satellite" />
        <div className="map-grid" />
        <div className="map-scan" />
        {showHeatmap && <div className="heatmap-layer" />}

        <div className="event-node" style={{ left: `${eventPoint.x}%`, top: `${eventPoint.y}%` }}>
          <span />
          <b>TOYOTA EXPERIENCE FEST</b>
        </div>

        {rings.map((ring) => (
          <div
            key={ring}
            className="distance-ring"
            style={{ "--ring-size": `${Math.min(1320, ring * 72)}px`, left: `${eventPoint.x}%`, top: `${eventPoint.y}%` } as CSSProperties}
          >
            <span>{ring} KM AL EVENTO</span>
          </div>
        ))}

        {(["NORTH", "EAST", "SOUTH", "WEST"] as const).map((corridor) => (
          <div key={corridor} className={`approach-corridor corridor-${corridor.toLowerCase()}`}>
            <span>{corridorLabel(corridor)}</span>
          </div>
        ))}

        <svg className="trail-layer" viewBox="0 0 100 100" preserveAspectRatio="none">
          <polygon
            className="event-geofence"
            points={geofencePoints.map((point) => `${point.x},${point.y}`).join(" ")}
          />
          {geofencePoints.map((point, index) => (
            <circle key={`${point.x}-${point.y}-${index}`} className="event-geofence-node" cx={point.x} cy={point.y} r="0.42" />
          ))}
          {selected && (
            <polyline
              className={`trail status-${selected.status.toLowerCase()} selected`}
              points={selected.trail.map((point) => {
                const p = projectToMap(point, mapBounds);
                return `${p.x},${p.y}`;
              }).join(" ")}
            />
          )}
          {selected && (
            <line
              className="approach-line"
              x1={projectToMap(selected, mapBounds).x}
              y1={projectToMap(selected, mapBounds).y}
              x2={eventPoint.x}
              y2={eventPoint.y}
            />
          )}
        </svg>

        <div className="event-geofence-label" style={{ left: `${geofenceLabel.x}%`, top: `${geofenceLabel.y}%` }}>
          GEOCERCA EVENTO
        </div>

        {visibleVehicles.map((vehicle) => (
          <VehicleTarget key={vehicle.id} vehicle={vehicle} selected={selectedId === vehicle.id} mapBounds={mapBounds} onSelect={() => onSelect(vehicle)} />
        ))}
      </div>

      {cinematicMode && (selected || closest) && (
        <div className="cinematic-target">
          <small>VEHICULO PRIORITARIO</small>
          <strong>{(selected || closest).plate}</strong>
          <span>{statusLabel((selected || closest).status)} / {(selected || closest).distanceToEvent.toFixed(1)} KM / ETA {(selected || closest).etaToEvent ?? "--"} MIN</span>
        </div>
      )}
      <div className="map-zoom-controls">
        <button onClick={() => setMapZoom((zoom) => Math.min(MAX_MAP_ZOOM, zoom + 1))} aria-label="Acercar mapa"><Plus size={16} /></button>
        <button onClick={() => setMapZoom((zoom) => Math.max(MIN_MAP_ZOOM, zoom - 1))} aria-label="Alejar mapa"><Minus size={16} /></button>
        <button onClick={() => { setMapCenter(eventGeofenceCenter); setMapZoom(EVENT_FOCUS_ZOOM); }} aria-label="Ir a geocerca"><LocateFixed size={16} /></button>
        <span>Z{mapZoom}</span>
      </div>
      {locatingVehicle && (
        <div className="map-locating" aria-live="polite">
          <div className="map-locating-card">
            <div className="data-loader">
              <i />
              <i />
              <i />
              <b />
            </div>
            <strong>LOCALIZANDO VEHICULO</strong>
            <span>Analizando telemetria real y ubicacion actual</span>
          </div>
        </div>
      )}
      <div className="map-attribution">Mapa de Quito / OpenStreetMap</div>
    </section>
  );
}

function VehicleTarget({ vehicle, selected, mapBounds, onSelect }: { vehicle: VehicleTelemetry; selected: boolean; mapBounds: ReturnType<typeof boundsFromCenter>; onSelect: () => void }) {
  const point = projectToMap(vehicle, mapBounds);
  const vectorLength = Math.min(38, 10 + vehicle.speed * 0.42);

  return (
    <button
      className={`vehicle-target status-${vehicle.status.toLowerCase()} ${selected ? "selected" : ""}`}
      style={{ left: `${point.x}%`, top: `${point.y}%` }}
      onClick={onSelect}
      title={`${vehicle.plate} ${vehicle.speed} km/h ${statusLabel(vehicle.status)}`}
    >
      <i className="target-vector" style={{ height: `${vectorLength}px`, transform: `translate(-50%, -100%) rotate(${vehicle.heading}deg)` }} />
      <span className="target-core" style={{ transform: `rotate(${vehicle.heading}deg)` }} />
      {selected && <strong className="target-selected-badge">ELEGIDO</strong>}
      <em>
        <b>{vehicle.plate}</b>
        <small>{vehicle.speed} km/h</small>
      </em>
    </button>
  );
}
