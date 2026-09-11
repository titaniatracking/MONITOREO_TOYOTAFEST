import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { VehicleSearchRecord, VehicleTelemetry } from "../types";
import { apiUrl } from "../utils/api";
import { statusLabel } from "../utils/labels";

interface SearchBarProps {
  query: string;
  vehicles: VehicleTelemetry[];
  onQuery: (query: string) => void;
  onSelect: (vehicle: VehicleTelemetry) => void;
  onSelectRecord: (record: VehicleSearchRecord) => void;
}

export function SearchBar({ query, vehicles, onQuery, onSelect, onSelectRecord }: SearchBarProps) {
  const [deferredQuery, setDeferredQuery] = useState(query);
  const [baseRecords, setBaseRecords] = useState<VehicleSearchRecord[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [searchRequest, setSearchRequest] = useState({ term: "", key: 0 });
  const indexedVehicles = useMemo(
    () => vehicles.map((vehicle) => ({ vehicle, searchText: vehicleSearchText(vehicle) })),
    [vehicles]
  );

  useEffect(() => {
    if (!query.trim()) {
      setDeferredQuery("");
      setBaseRecords([]);
      setAnalyzing(false);
      setSearchRequest((current) => current.term ? { term: "", key: current.key + 1 } : current);
      return;
    }
    const timer = window.setTimeout(() => setDeferredQuery(query), 180);
    setBaseRecords([]);
    setAnalyzing(false);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const search = normalize(searchRequest.term);
    if (!searchRequest.key || search.length < 2) return;

    const controller = new AbortController();
    const runSearch = async () => {
      try {
        setAnalyzing(true);
        const response = await fetch(apiUrl(`/api/vehicles/search?q=${encodeURIComponent(searchRequest.term)}`), { signal: controller.signal });
        const data = (await response.json()) as { records?: VehicleSearchRecord[] };
        setBaseRecords(data.records ?? []);
      } catch {
        if (!controller.signal.aborted) setBaseRecords([]);
      } finally {
        if (!controller.signal.aborted) window.setTimeout(() => setAnalyzing(false), 480);
      }
    };
    runSearch();

    return () => {
      controller.abort();
    };
  }, [searchRequest]);

  const submitSearch = () => {
    const term = query.trim();
    setDeferredQuery(term);
    setSearchRequest((current) => ({ term, key: current.key + 1 }));
  };

  const searchTerm = normalize(deferredQuery);
  const results = useMemo(() => {
    const rows = searchTerm
      ? indexedVehicles.filter((row) => row.searchText.includes(searchTerm)).map((row) => row.vehicle)
      : [];
    return rows.slice(0, 80);
  }, [indexedVehicles, searchTerm, vehicles]);

  const mergedBaseRecords = useMemo(() => {
    const liveKeys = new Set(results.flatMap((vehicle) => [vehicle.deviceId, vehicle.imei, vehicle.chassis, vehicle.plate].filter(Boolean).map((value) => normalize(String(value)))));
    return baseRecords.filter((record) => ![record.deviceId, record.imei, record.chassis, record.plate].some((value) => value && liveKeys.has(normalize(String(value))))).slice(0, 80);
  }, [baseRecords, results]);

  return (
    <div className="search-box">
      <div className="search-input">
        <Search size={16} />
        <input
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") submitSearch();
          }}
          placeholder="Buscar placa, nombre, cedula, chasis o dispositivo..."
        />
        <button onClick={submitSearch}>Buscar</button>
      </div>
      {analyzing && (
        <div className="search-analyzer">
          <span />
          <b>Analizando base central</b>
        </div>
      )}
      {searchTerm && <div className="search-count">{results.length + mergedBaseRecords.length} visibles / {vehicles.length} con telemetria</div>}
      {(results.length > 0 || mergedBaseRecords.length > 0) && (
        <div className="search-results">
          {results.map((vehicle) => (
            <button key={vehicle.id} onClick={() => onSelect(vehicle)}>
              <strong>{displayPlate(vehicle)}</strong>
              <span>{vehicle.owner && vehicle.owner !== "Dato real" ? vehicle.owner : vehicle.model}</span>
              <em>{statusLabel(vehicle.status)}</em>
              <small>{vehicle.model}</small>
              <small>{vehicle.chassis || vehicle.document || "Dato Vapor pendiente"}</small>
            </button>
          ))}
          {mergedBaseRecords.map((record) => (
            <button key={`base-${record.id}`} className="database-only" title="Registro de base central" onClick={() => onSelectRecord(record)}>
              <strong>{displaySearchPlate(record)}</strong>
              <span>{record.owner || record.dealer || record.model}</span>
              <em>{record.serviceStatus || "BASE"}</em>
              <small>{record.model}</small>
              <small>{record.chassis || record.document || record.imei || "Base central"}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function displayPlate(vehicle: VehicleTelemetry) {
  const plate = vehicle.plate || "";
  return /^\d{10,}$/.test(plate) ? "SIN PLACA" : plate || "SIN PLACA";
}

function displaySearchPlate(vehicle: VehicleSearchRecord) {
  const plate = vehicle.plate || "";
  return /^\d{10,}$/.test(plate) ? "SIN PLACA" : plate || "SIN PLACA";
}

function vehicleSearchText(vehicle: VehicleTelemetry) {
  return normalize([
    vehicle.plate,
    vehicle.deviceId,
    vehicle.id,
    vehicle.owner,
    vehicle.model,
    vehicle.document,
    vehicle.chassis,
    vehicle.imei,
    vehicle.sim,
    vehicle.dealer,
    vehicle.dealerCode,
    vehicle.color,
    vehicle.engine,
    vehicle.status,
    ...(vehicle.lookupIds ?? []),
  ].filter(Boolean).join(" "));
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[-_\s.]/g, "");
}
