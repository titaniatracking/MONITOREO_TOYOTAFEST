import type { Corridor, GeoPoint } from "../types";

export const EVENT_CENTER: GeoPoint = {
  lat: -0.021262916295404,
  lng: -78.4483948182255,
};

// Perimetro operativo trazado sobre el recinto indicado, sin incluir las vias,
// el rio ni los sectores residenciales colindantes.
export const EVENT_POLYGON: GeoPoint[] = [
  { lat: -0.02072542, lng: -78.449665185 },
  { lat: -0.020715677, lng: -78.449172655 },
  { lat: -0.020686448, lng: -78.448662106 },
  { lat: -0.020715677, lng: -78.448241653 },
  { lat: -0.020793622, lng: -78.447971362 },
  { lat: -0.020998228, lng: -78.447731104 },
  { lat: -0.021154118, lng: -78.447520878 },
  { lat: -0.02122232, lng: -78.447328671 },
  { lat: -0.02137821, lng: -78.447226561 },
  { lat: -0.021631532, lng: -78.447220554 },
  { lat: -0.021836137, lng: -78.447292632 },
  { lat: -0.021953055, lng: -78.447430781 },
  { lat: -0.022011514, lng: -78.447671039 },
  { lat: -0.022079716, lng: -78.448169576 },
  { lat: -0.022138175, lng: -78.448421847 },
  { lat: -0.022079716, lng: -78.448692138 },
  { lat: -0.022001771, lng: -78.44923272 },
  { lat: -0.022040743, lng: -78.449442946 },
  { lat: -0.022157661, lng: -78.449611127 },
  { lat: -0.021836137, lng: -78.449593108 },
  { lat: -0.021504871, lng: -78.449617134 },
  { lat: -0.021232063, lng: -78.449593108 },
  { lat: -0.020968998, lng: -78.449647166 },
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

export function isInsideEventGeofence(point: GeoPoint) {
  let inside = false;

  for (let current = 0, previous = EVENT_POLYGON.length - 1; current < EVENT_POLYGON.length; previous = current, current += 1) {
    const a = EVENT_POLYGON[current];
    const b = EVENT_POLYGON[previous];
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
