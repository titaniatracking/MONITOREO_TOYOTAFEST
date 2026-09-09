import type { Corridor, GeoPoint } from "../types";

export const EVENT_CENTER: GeoPoint = {
  lat: -0.021262916295404,
  lng: -78.4483948182255,
};

// Respaldo exacto de la geocerca 982 de Traccar.
export const EVENT_POLYGON: GeoPoint[] = [
  { lat: -0.020209702295415, lng: -78.451972885051 },
  { lat: -0.022763165097831, lng: -78.451844139019 },
  { lat: -0.02284899577951, lng: -78.44623295776 },
  { lat: -0.021121653301151, lng: -78.445321006694 },
  { lat: -0.020435007838491, lng: -78.447241468349 },
  { lat: -0.020198973460024, lng: -78.44775645248 },
];

export const MAP_BOUNDS = {
  north: EVENT_CENTER.lat + 0.075,
  south: EVENT_CENTER.lat - 0.075,
  east: EVENT_CENTER.lng + 0.095,
  west: EVENT_CENTER.lng - 0.095,
};

const EARTH_RADIUS_KM = 6371;

export function distanceKm(a: GeoPoint, b: GeoPoint) {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

export function isInsideEventGeofence(point: GeoPoint, polygon = EVENT_POLYGON) {
  let inside = false;

  for (let current = 0, previous = polygon.length - 1; current < polygon.length; previous = current, current += 1) {
    const a = polygon[current];
    const b = polygon[previous];
    const crossesLatitude = a.lat > point.lat !== b.lat > point.lat;
    const boundaryLng = ((b.lng - a.lng) * (point.lat - a.lat)) / (b.lat - a.lat || Number.EPSILON) + a.lng;

    if (crossesLatitude && point.lng < boundaryLng) inside = !inside;
  }

  return inside;
}

export function bearingDeg(from: GeoPoint, to: GeoPoint) {
  const lat1 = toRad(from.lat);
  const lat2 = toRad(to.lat);
  const dLng = toRad(to.lng - from.lng);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

export interface MapBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export function boundsFromCenter(center: GeoPoint, zoomLevel: number): MapBounds {
  const scale = 2 ** (13.6 - zoomLevel);
  const latSpan = (MAP_BOUNDS.north - MAP_BOUNDS.south) * scale;
  const lngSpan = (MAP_BOUNDS.east - MAP_BOUNDS.west) * scale;
  return {
    north: center.lat + latSpan / 2,
    south: center.lat - latSpan / 2,
    east: center.lng + lngSpan / 2,
    west: center.lng - lngSpan / 2,
  };
}

export function projectToMap(point: GeoPoint, bounds = MAP_BOUNDS) {
  const raw = projectToMapRaw(point, bounds);
  return { x: clamp(raw.x, 0, 100), y: clamp(raw.y, 0, 100) };
}

export function projectToMapRaw(point: GeoPoint, bounds = MAP_BOUNDS) {
  const x = ((lngToWorld(point.lng) - lngToWorld(bounds.west)) / (lngToWorld(bounds.east) - lngToWorld(bounds.west))) * 100;
  const y = ((latToWorld(bounds.north) - latToWorld(point.lat)) / (latToWorld(bounds.north) - latToWorld(bounds.south))) * 100;
  return { x, y };
}

export function getQuitoTiles(zoom = 13, bounds = MAP_BOUNDS) {
  const northWest = latLngToTile(bounds.north, bounds.west, zoom);
  const southEast = latLngToTile(bounds.south, bounds.east, zoom);
  const tiles = [];

  for (let x = northWest.x; x <= southEast.x; x += 1) {
    for (let y = northWest.y; y <= southEast.y; y += 1) {
      const left = ((x / 2 ** zoom - lngToWorld(bounds.west)) / (lngToWorld(bounds.east) - lngToWorld(bounds.west))) * 100;
      const right = (((x + 1) / 2 ** zoom - lngToWorld(bounds.west)) / (lngToWorld(bounds.east) - lngToWorld(bounds.west))) * 100;
      const top = ((y / 2 ** zoom - latToWorld(bounds.north)) / (latToWorld(bounds.south) - latToWorld(bounds.north))) * 100;
      const bottom = ((((y + 1) / 2 ** zoom) - latToWorld(bounds.north)) / (latToWorld(bounds.south) - latToWorld(bounds.north))) * 100;
      tiles.push({
        key: `${zoom}-${x}-${y}`,
        url: `https://tile.openstreetmap.org/${zoom}/${x}/${y}.png`,
        left,
        top,
        width: right - left,
        height: bottom - top,
      });
    }
  }

  return tiles;
}

export function getStaticQuitoMapUrl(bounds = MAP_BOUNDS) {
  const bbox = [bounds.west, bounds.south, bounds.east, bounds.north].map((value) => value.toFixed(6)).join(",");
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik`;
}

export function moveToward(from: GeoPoint, to: GeoPoint, km: number): GeoPoint {
  const total = distanceKm(from, to);
  if (total === 0) return from;
  const ratio = Math.min(km / total, 1);
  return {
    lat: from.lat + (to.lat - from.lat) * ratio,
    lng: from.lng + (to.lng - from.lng) * ratio,
  };
}

export function etaMinutes(distance: number, speed: number) {
  if (speed < 6) return undefined;
  return Math.max(1, Math.round((distance / speed) * 60));
}

export function corridorFor(point: GeoPoint): Corridor {
  const northSouth = Math.abs(point.lat - EVENT_CENTER.lat);
  const eastWest = Math.abs(point.lng - EVENT_CENTER.lng);
  if (northSouth > eastWest) return point.lat > EVENT_CENTER.lat ? "NORTH" : "SOUTH";
  return point.lng > EVENT_CENTER.lng ? "EAST" : "WEST";
}

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function toRad(value: number) {
  return (value * Math.PI) / 180;
}

function toDeg(value: number) {
  return (value * 180) / Math.PI;
}

function latLngToTile(lat: number, lng: number, zoom: number) {
  const n = 2 ** zoom;
  return {
    x: Math.floor(lngToWorld(lng) * n),
    y: Math.floor(latToWorld(lat) * n),
  };
}

function lngToWorld(lng: number) {
  return (lng + 180) / 360;
}

function latToWorld(lat: number) {
  const sin = Math.sin(toRad(lat));
  return 0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI);
}
