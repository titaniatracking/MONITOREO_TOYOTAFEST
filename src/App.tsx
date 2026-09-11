import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  CheckCircle2,
  FileText,
  Gauge,
  Home,
  MapPinned,
  Menu,
  Navigation,
  PanelLeftClose,
  PanelLeftOpen,
  Route,
  Search,
  Settings,
  ShieldCheck,
  TrendingUp,
  Wifi,
  X,
} from "lucide-react";
import { ActivityFeed } from "./components/ActivityFeed";
import { EventReports } from "./components/EventReports";
import { LoadingScreen } from "./components/LoadingScreen";
import { RadarMap } from "./components/RadarMap";
import { ReplayControls } from "./components/ReplayControls";
import { SearchBar } from "./components/SearchBar";
import { VehiclePanel } from "./components/VehiclePanel";
import { useBackendHealth } from "./hooks/useBackendHealth";
import { useToyotaRadar } from "./hooks/useToyotaRadar";
import type { GeoPoint, VehicleSearchRecord, VehicleStatus, VehicleTelemetry } from "./types";
import { apiUrl } from "./utils/api";
import { corridorFor, distanceKm, etaMinutes, EVENT_CENTER } from "./utils/geo";
import { statusLabel } from "./utils/labels";

type ViewKey = "summary" | "map" | "search" | "routes" | "reports" | "settings";

const TOYOTA_LOGO_URL = "/experiencefest/experience-fest-alt-Suxh23_l.png";
const vehicleDetailCache = new Map<string, VehicleSearchRecord>();

const menuItems: Array<{ key: ViewKey; label: string; icon: ReactNode }> = [
  { key: "summary", label: "Resumen", icon: <Home size={17} /> },
  { key: "map", label: "Mapa en tiempo real", icon: <MapPinned size={17} /> },
  { key: "search", label: "Buscar vehiculo", icon: <Search size={17} /> },
  { key: "routes", label: "Recorridos", icon: <Route size={17} /> },
  { key: "reports", label: "Reportes", icon: <FileText size={17} /> },
  { key: "settings", label: "Configuracion", icon: <Settings size={17} /> },
];

export function App() {
  const { vehicles, stats, lastUpdate, source, loadingRealData, error, eventPolygon } = useToyotaRadar();
  const backendHealth = useBackendHealth();
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState<ViewKey>("summary");
  const [selected, setSelected] = useState<VehicleTelemetry | VehicleSearchRecord | null>(null);
  const [filter, setFilter] = useState<VehicleStatus | "ALL">("ALL");
  const [query, setQuery] = useState("");
  const [radarMode, setRadarMode] = useState(true);
  const [cinematicMode, setCinematicMode] = useState(false);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [replay, setReplay] = useState(false);
  const [follow, setFollow] = useState(false);
  const [eventFocusKey, setEventFocusKey] = useState(0);
  const [selectedFocusKey, setSelectedFocusKey] = useState(0);
  const [isolateSelected, setIsolateSelected] = useState(false);
  const [locatingVehicle, setLocatingVehicle] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const selectionRequestId = useRef(0);
  const hasSearchQuery = query.trim().length >= 2;
  const shouldShowOnlySelected = hasSearchQuery && isolateSelected && selected && isLiveVehicle(selected);

  useEffect(() => {
    const timer = window.setTimeout(() => setLoading(false), 900);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    setSelected((current) => {
      if (!current || !isLiveVehicle(current)) return current;
      const fresh = vehicles.find((vehicle) => sameVehicle(vehicle, current));
      return fresh ? mergeSelectedWithFreshPosition(current, fresh) : current;
    });
  }, [vehicles]);

  useEffect(() => {
    if (hasSearchQuery) return;
    setIsolateSelected(false);
  }, [hasSearchQuery]);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileMenuOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [mobileMenuOpen]);

  const visibleVehicles = useMemo(() => {
    return filter === "ALL" ? vehicles : vehicles.filter((vehicle) => vehicle.status === filter);
  }, [filter, vehicles]);

  const mapVehicles = useMemo(() => {
    if (shouldShowOnlySelected) return [selected];

    const nearbyVehicles = hasSearchQuery ? visibleVehicles : visibleVehicles.filter((vehicle) => vehicle.distanceToEvent <= 10);
    const prioritized = nearbyVehicles
      .slice()
      .sort((a, b) => mapPriority(a) - mapPriority(b) || a.distanceToEvent - b.distanceToEvent)
      .slice(0, 120);

    if (hasSearchQuery && selected && isLiveVehicle(selected) && !prioritized.some((vehicle) => sameVehicle(vehicle, selected))) {
      return [selected, ...prioritized].slice(0, 120);
    }

    return prioritized;
  }, [hasSearchQuery, selected, shouldShowOnlySelected, visibleVehicles]);

  const selectStatusFilter = (status: VehicleStatus) => {
    setFilter((current) => (current === status ? "ALL" : status));
  };

  const clearVehicleSelection = () => {
    selectionRequestId.current += 1;
    setSelected(null);
    setFollow(false);
    setIsolateSelected(false);
    setLocatingVehicle(false);
  };

  const focusEvent = () => {
    clearVehicleSelection();
    setQuery("");
    setFilter("ALL");
    setEventFocusKey((value) => value + 1);
  };

  const resetSearchAndFocusEvent = () => {
    focusEvent();
    setActiveView("summary");
  };

  const selectVehicle = async (vehicle: VehicleTelemetry) => {
    const requestId = ++selectionRequestId.current;
    setLocatingVehicle(true);
    setSelected((current) => current && isLiveVehicle(current) && sameVehicle(current, vehicle) ? mergeSelectedWithFreshPosition(current, vehicle) : vehicle);
    setFilter("ALL");
    setFollow(false);
    setSelectedFocusKey((value) => value + 1);

    try {
      const enriched = await enrichSelectedVehicle(vehicle);
      if (enriched && requestId === selectionRequestId.current) setSelected(mergeLiveWithRecord(vehicle, enriched));
    } finally {
      window.setTimeout(() => {
        if (requestId === selectionRequestId.current) setLocatingVehicle(false);
      }, 350);
    }
  };

  const openVehicleSummary = async (vehicle: VehicleTelemetry) => {
    const requestId = ++selectionRequestId.current;
    setLocatingVehicle(true);
    setSelected(vehicle);
    setFilter("ALL");
    setFollow(false);
    setIsolateSelected(true);
    setSelectedFocusKey((value) => value + 1);
    setActiveView("summary");

    try {
      const enriched = await enrichSelectedVehicle(vehicle);
      if (enriched && requestId === selectionRequestId.current) setSelected(mergeLiveWithRecord(vehicle, enriched));
    } finally {
      window.setTimeout(() => {
        if (requestId === selectionRequestId.current) setLocatingVehicle(false);
      }, 350);
    }
  };

  const focusSearchRecord = async (record: VehicleSearchRecord) => {
    const requestId = ++selectionRequestId.current;
    setLocatingVehicle(true);
    const recordKeys = [record.plate, record.chassis, record.imei, record.deviceId].filter(Boolean).map((item) => normalizeKey(String(item)));
    const live = vehicles.find((vehicle) =>
      [vehicle.plate, vehicle.chassis, vehicle.imei, vehicle.deviceId, ...(vehicle.lookupIds ?? [])]
        .filter(Boolean)
        .some((item) => recordKeys.includes(normalizeKey(String(item))))
    );

    setSelected(live ? mergeLiveWithRecord(live, record) : record);
    setFilter("ALL");
    setFollow(false);
    setIsolateSelected(Boolean(live));
    if (live) setSelectedFocusKey((value) => value + 1);
    setActiveView("summary");

    try {
      if (live) {
        const enriched = await enrichSelectedVehicle(mergeLiveWithRecord(live, record));
        if (enriched && requestId === selectionRequestId.current) setSelected(mergeLiveWithRecord(live, enriched));
      } else {
        const located = await locateSearchRecord(record);
        if (located && requestId === selectionRequestId.current) {
          setSelected(mergeLiveWithRecord(located, record));
          setIsolateSelected(true);
          setSelectedFocusKey((value) => value + 1);
        }
      }
    } finally {
      window.setTimeout(() => {
        if (requestId === selectionRequestId.current) setLocatingVehicle(false);
      }, 350);
    }
  };

  if (loading) return <LoadingScreen />;

  return (
    <main className={`system-dashboard ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      <button
        className="mobile-menu-toggle"
        type="button"
        aria-label={mobileMenuOpen ? "Cerrar menu" : "Abrir menu"}
        aria-expanded={mobileMenuOpen}
        aria-controls="main-navigation"
        onClick={() => setMobileMenuOpen((open) => !open)}
      >
        {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
      </button>
      {mobileMenuOpen && <button className="mobile-menu-backdrop" type="button" aria-label="Cerrar menu" onClick={() => setMobileMenuOpen(false)} />}
      <aside className={`sidebar ${sidebarCollapsed ? "collapsed" : ""} ${mobileMenuOpen ? "mobile-open" : ""}`}>
        <div className="toyota-mark">
          <img src={TOYOTA_LOGO_URL} alt="Toyota" />
          <div>
            <strong>TOYOTA</strong>
            <span>Experience Fest</span>
          </div>
          <button
            className="sidebar-collapse"
            type="button"
            aria-label={sidebarCollapsed ? "Expandir menu" : "Contraer menu"}
            title={sidebarCollapsed ? "Expandir menu" : "Contraer menu"}
            onClick={() => setSidebarCollapsed((value) => !value)}
          >
            {sidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
        </div>
        <nav id="main-navigation">
          {menuItems.map((item) => (
            <button key={item.key} className={activeView === item.key ? "active" : ""} onClick={() => { setActiveView(item.key); setMobileMenuOpen(false); }}>
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-status">
          <span className={backendHealth?.flespiConfigured ? "live-dot" : "warn-dot"}>{backendHealth?.flespiConfigured ? "FLESPI configurado" : "FLESPI pendiente"}</span>
          <small>Base {backendHealth?.database === "connected" ? "conectada" : "pendiente"}</small>
          <small>Datos {source === "database" ? "desde MySQL" : "en vivo"}</small>
        </div>
      </aside>

      <section className={`dashboard-main view-${activeView}`}>
        {activeView === "summary" && (
          <>
            <div className="summary-toolbar">
              <SummaryRow stats={stats} totalVehicles={vehicles.length} activeFilter={filter} onFilter={selectStatusFilter} />
              <div className="top-search">
                <SearchPanel query={query} vehicles={vehicles} setQuery={setQuery} onSelect={openVehicleSummary} onSelectRecord={focusSearchRecord} onEventFocus={resetSearchAndFocusEvent} />
              </div>
            </div>
            <section className="content-grid">
              <MapPanel stats={stats} activeFilter={filter} onFilter={selectStatusFilter} vehicles={mapVehicles} eventPolygon={eventPolygon} selected={isLiveVehicle(selected) ? selected : null} radarMode={radarMode} cinematicMode={cinematicMode} showHeatmap={showHeatmap} isolateSelected={Boolean(shouldShowOnlySelected)} canIsolateSelected={hasSearchQuery} loading={loadingRealData} locatingVehicle={locatingVehicle} eventFocusKey={eventFocusKey} selectedFocusKey={selectedFocusKey} onSelect={selectVehicle} onRadarMode={() => setRadarMode((value) => !value)} onCinematicMode={() => setCinematicMode((value) => !value)} onHeatmap={() => setShowHeatmap((value) => !value)} onToggleIsolate={() => setIsolateSelected((value) => !value)} />
              {selected && (
                <section className="panel vehicle-card">
                  <VehiclePanel vehicle={selected} follow={follow} onClose={clearVehicleSelection} onFollow={() => setFollow((value) => !value)} onCenterVehicle={() => { if (hasSearchQuery) setIsolateSelected(true); setSelectedFocusKey((value) => value + 1); }} onCenterEvent={focusEvent} />
                </section>
              )}
            </section>
            <section className="bottom-grid">
              <RoutesPanel vehicles={vehicles} onSelect={openVehicleSummary} />
              <ActivityFeed />
              <SystemPanel backendHealth={backendHealth} source={source} error={error} />
            </section>
          </>
        )}

        {activeView === "map" && (
          <section className="single-view">
            <MapPanel stats={stats} activeFilter={filter} onFilter={selectStatusFilter} vehicles={mapVehicles} eventPolygon={eventPolygon} selected={isLiveVehicle(selected) ? selected : null} radarMode={radarMode} cinematicMode={cinematicMode} showHeatmap={showHeatmap} isolateSelected={Boolean(shouldShowOnlySelected)} canIsolateSelected={hasSearchQuery} loading={loadingRealData} locatingVehicle={locatingVehicle} eventFocusKey={eventFocusKey} selectedFocusKey={selectedFocusKey} onSelect={selectVehicle} onRadarMode={() => setRadarMode((value) => !value)} onCinematicMode={() => setCinematicMode((value) => !value)} onHeatmap={() => setShowHeatmap((value) => !value)} onToggleIsolate={() => setIsolateSelected((value) => !value)} large />
          </section>
        )}

        {activeView === "search" && (
          <section className="single-view compact-view">
            <SearchPanel query={query} vehicles={vehicles} setQuery={setQuery} onSelect={openVehicleSummary} onSelectRecord={focusSearchRecord} onEventFocus={resetSearchAndFocusEvent} />
          </section>
        )}

        {activeView === "routes" && (
          <section className="single-view compact-view">
            <RoutesPanel vehicles={vehicles} onSelect={openVehicleSummary} />
          </section>
        )}

        {activeView === "reports" && (
          <section className="single-view compact-view">
            <ReportsPanel />
          </section>
        )}

        {activeView === "settings" && (
          <section className="single-view compact-view">
            <SystemPanel backendHealth={backendHealth} source={source} error={error} />
          </section>
        )}

        {selected && <ReplayControls active={replay} onToggle={() => setReplay((value) => !value)} />}
      </section>
    </main>
  );
}

function SummaryRow({
  stats,
  totalVehicles,
  activeFilter,
  onFilter,
}: {
  stats: ReturnType<typeof useToyotaRadar>["stats"];
  totalVehicles: number;
  activeFilter: VehicleStatus | "ALL";
  onFilter: (status: VehicleStatus) => void;
}) {
  return (
    <section className="summary-row">
      <div className="summary-brand" aria-label="Toyota Experience Fest">
        <img src={TOYOTA_LOGO_URL} alt="Toyota Experience Fest" />
      </div>
      <SummaryCard icon={<CheckCircle2 size={26} />} label="En evento" value={stats.atEvent} hint={`${totalVehicles} vehiculos monitoreados`} tone="green" active={activeFilter === "AT_EVENT"} onClick={() => onFilter("AT_EVENT")} />
      <SummaryCard icon={<TrendingUp size={26} />} label="Ingresando" value={stats.arriving} hint="Entrando a la geocerca" tone="purple" active={activeFilter === "ARRIVING"} onClick={() => onFilter("ARRIVING")} />
      <SummaryCard icon={<Navigation size={26} />} label="Vehiculos acercandose" value={stats.approaching} hint="Proximos a la geocerca" tone="blue" active={activeFilter === "APPROACHING"} onClick={() => onFilter("APPROACHING")} />
    </section>
  );
}

function MapPanel(props: {
  stats: ReturnType<typeof useToyotaRadar>["stats"];
  activeFilter: VehicleStatus | "ALL";
  onFilter: (status: VehicleStatus) => void;
  vehicles: VehicleTelemetry[];
  eventPolygon: GeoPoint[];
  selected: VehicleTelemetry | null;
  radarMode: boolean;
  cinematicMode: boolean;
  showHeatmap: boolean;
  isolateSelected: boolean;
  canIsolateSelected: boolean;
  loading: boolean;
  locatingVehicle: boolean;
  eventFocusKey: number;
  selectedFocusKey: number;
  onSelect: (vehicle: VehicleTelemetry) => void;
  onRadarMode: () => void;
  onCinematicMode: () => void;
  onHeatmap: () => void;
  onToggleIsolate: () => void;
  large?: boolean;
}) {
  const hasSelectedVehicle = Boolean(
    props.selected && props.vehicles.some((vehicle) => sameVehicle(props.selected as VehicleTelemetry, vehicle))
  );
  const radarVehicles = props.selected
    ? hasSelectedVehicle
      ? props.vehicles.map((vehicle) =>
          sameVehicle(props.selected as VehicleTelemetry, vehicle)
            ? { ...mergeSelectedWithFreshPosition(props.selected as VehicleTelemetry, vehicle), id: props.selected!.id }
            : vehicle
        )
      : [props.selected, ...props.vehicles]
    : props.vehicles;

  return (
    <section className={`panel map-card ${props.large ? "large-map-card" : ""}`}>
      <div className="map-panel-head">
        <PanelTitle title="Mapa en tiempo real" />
        <div className="map-mode-strip">
          <button className={props.radarMode ? "active" : ""} onClick={props.onRadarMode}>Modo radar</button>
          <button className={props.cinematicMode ? "active" : ""} onClick={props.onCinematicMode}>Modo cinematico</button>
          <button className={props.showHeatmap ? "active" : ""} onClick={props.onHeatmap}>Mapa de calor</button>
          <button className={props.isolateSelected ? "active" : ""} disabled={!props.selected || !props.canIsolateSelected} onClick={props.onToggleIsolate}>Solo elegido</button>
        </div>
      </div>
      <RadarMap vehicles={radarVehicles} eventPolygon={props.eventPolygon} selectedId={props.selected?.id} radarMode={props.radarMode} cinematicMode={props.cinematicMode} showHeatmap={props.showHeatmap} locatingVehicle={props.locatingVehicle} eventFocusKey={props.eventFocusKey} selectedFocusKey={props.selectedFocusKey} onSelect={props.onSelect} />
      {props.loading && !props.vehicles.length && <EmptyOverlay title="Cargando vehiculos reales" text="Consultando Flespi, Traccar y MySQL." />}
      <div className="map-legend">
        <span><i className="green" />En evento</span>
        <span><i className="blue" />En movimiento</span>
        <span><i className="purple" />Ingresando</span>
        <span><i className="orange" />Saliendo</span>
        <span><i className="gray" />Sin senal</span>
      </div>
    </section>
  );
}

function MapIndicators({
  stats,
  activeFilter,
  onFilter,
}: {
  stats: ReturnType<typeof useToyotaRadar>["stats"];
  activeFilter: VehicleStatus | "ALL";
  onFilter: (status: VehicleStatus) => void;
}) {
  const indicators = [
    { label: "En evento", value: stats.atEvent, tone: "green", status: "AT_EVENT" },
    { label: "En movimiento", value: stats.moving, tone: "blue", status: "MOVING" },
    { label: "Ingresando", value: stats.arriving, tone: "purple", status: "ARRIVING" },
    { label: "Saliendo", value: stats.departing, tone: "orange", status: "DEPARTING" },
  ];

  return (
    <div className="map-indicators">
      {indicators.map((item) => (
        <button key={item.label} className={`map-indicator ${item.tone} ${activeFilter === item.status ? "active" : ""}`} onClick={() => onFilter(item.status as VehicleStatus)}>
          <i />
          <b>{item.value}</b>
          <small>{item.label}</small>
        </button>
      ))}
    </div>
  );
}

function SearchPanel(props: {
  query: string;
  vehicles: VehicleTelemetry[];
  setQuery: (query: string) => void;
  onSelect: (vehicle: VehicleTelemetry) => void;
  onSelectRecord: (record: VehicleSearchRecord) => void;
  onEventFocus: () => void;
}) {
  return (
    <section className="panel search-card">
      <PanelTitle title="Buscar vehiculo" />
      <SearchBar query={props.query} vehicles={props.vehicles} onQuery={props.setQuery} onSelect={props.onSelect} onSelectRecord={props.onSelectRecord} onEventFocus={props.onEventFocus} />
      {!props.vehicles.length && <EmptyState title="Sin vehiculos reales" text="La busqueda se habilitara cuando el backend reciba telemetria real." />}
    </section>
  );
}

function RoutesPanel({ vehicles, onSelect }: { vehicles: VehicleTelemetry[]; onSelect: (vehicle: VehicleTelemetry) => void }) {
  const sortedBySignal = vehicles.slice().sort((a, b) => b.timestamp - a.timestamp);
  const closest = vehicles.slice().sort((a, b) => a.distanceToEvent - b.distanceToEvent).slice(0, 4);
  const moving = vehicles.filter((vehicle) => ["MOVING", "APPROACHING", "ARRIVING", "DEPARTING"].includes(vehicle.status)).length;
  const lastSignal = sortedBySignal[0]?.timestamp;

  return (
    <section className="panel recent-routes">
      <PanelTitle title="Resumen diario de recorridos" />
      {vehicles.length ? (
        <div className="route-summary">
          <div className="route-summary-kpis">
            <span><b>{vehicles.length}</b> vehiculos con senal</span>
            <span><b>{moving}</b> en movimiento</span>
            <span><b>{lastSignal ? new Date(lastSignal).toLocaleTimeString("es-EC", { hour: "2-digit", minute: "2-digit" }) : "--"}</b> ultima senal</span>
          </div>
          <div className="route-summary-list">
            {closest.map((vehicle) => (
              <button key={vehicle.id} onClick={() => onSelect(vehicle)}>
                <strong>{vehicle.plate}</strong>
                <span>{vehicle.distanceToEvent.toFixed(1)} km del evento</span>
                <em>{statusLabel(vehicle.status)} / {sectorLabel(vehicle)} / {vehicle.speed.toFixed(0)} km/h</em>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <EmptyState title="Sin recorridos reales" text="Aun no existen posiciones de Flespi guardadas para mostrar recorridos." />
      )}
    </section>
  );
}

function ReportsPanel() {
  return (
    <section className="panel reports-card">
      <PanelTitle title="Reporte de ingresos al evento" />
      <EventReports />
    </section>
  );
}

function SystemPanel({ backendHealth, source, error }: { backendHealth: ReturnType<typeof useBackendHealth>; source: string; error: string | null }) {
  return (
    <section className="panel system-card">
      <PanelTitle title="Configuracion del sistema" />
      <div className="system-info">
        <ShieldCheck size={28} />
        <div>
          <strong>Datos reales obligatorios</strong>
          <span>Solo telemetria real desde Flespi o MySQL.</span>
        </div>
      </div>
      <div className="system-health">
        <span><Wifi size={15} />Backend {backendHealth?.ok ? "listo" : "sin conexion"}</span>
        <span><Gauge size={15} />Base {backendHealth?.database === "connected" ? "conectada" : "pendiente"}</span>
        <span><Gauge size={15} />Flespi {backendHealth?.flespiConfigured ? "configurado" : "token pendiente"}</span>
        <span><Gauge size={15} />Traccar {backendHealth?.traccarConfigured ? "configurado" : "pendiente"}</span>
        <span><Gauge size={15} />Vapor {backendHealth?.vaporConfigured ? "cruce activo" : "cruce pendiente"}</span>
        <span>Origen de datos: {source === "flespi" ? "Flespi en vivo" : source === "traccar" ? "Traccar en vivo" : "MySQL"}</span>
        {error && <span className="error-text">{error}</span>}
      </div>
    </section>
  );
}

function SummaryCard({ icon, label, value, hint, tone, active = false, onClick }: { icon: ReactNode; label: string; value: string | number; hint: string; tone: string; active?: boolean; onClick?: () => void }) {
  const content = (
    <>
      <div>{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{hint}</small>
    </>
  );

  if (onClick) {
    return (
      <button className={`summary-card ${tone} interactive ${active ? "active" : ""}`} onClick={onClick}>
        {content}
      </button>
    );
  }

  return (
    <article className={`summary-card ${tone}`}>
      {content}
    </article>
  );
}

function sectorLabel(vehicle: VehicleTelemetry) {
  if (vehicle.distanceToEvent < 0.55) return "Dentro del evento";
  if (!vehicle.approachCorridor) return "Sector Quito";
  const labels: Record<string, string> = {
    NORTH: "Norte de Quito",
    SOUTH: "Sur de Quito",
    EAST: "Oriente de Quito",
    WEST: "Occidente de Quito",
  };
  return labels[vehicle.approachCorridor] ?? "Sector Quito";
}

function mapPriority(vehicle: VehicleTelemetry) {
  const statusOrder: Record<VehicleStatus, number> = {
    AT_EVENT: 0,
    ARRIVING: 1,
    DEPARTING: 2,
    APPROACHING: 3,
    MOVING: vehicle.distanceToEvent <= 8 ? 4 : 6,
    STOPPED: vehicle.distanceToEvent <= 8 ? 5 : 7,
    OFFLINE: vehicle.distanceToEvent <= 8 ? 8 : 9,
  };

  return statusOrder[vehicle.status] ?? 9;
}

function isLiveVehicle(vehicle: VehicleTelemetry | VehicleSearchRecord | null): vehicle is VehicleTelemetry {
  return Boolean(vehicle && Number.isFinite(Number((vehicle as VehicleTelemetry).lat)) && Number.isFinite(Number((vehicle as VehicleTelemetry).lng)));
}

function mergeSelectedWithFreshPosition(selected: VehicleTelemetry, fresh: VehicleTelemetry): VehicleTelemetry {
  return {
    ...selected,
    ...fresh,
    plate: preferDetail(selected.plate, fresh.plate) || fresh.plate || selected.plate,
    model: preferDetail(selected.model, fresh.model) || fresh.model || selected.model,
    owner: preferDetail(selected.owner, fresh.owner) || fresh.owner || selected.owner,
    document: preferDetail(selected.document, fresh.document),
    chassis: preferDetail(selected.chassis, fresh.chassis),
    imei: preferDetail(selected.imei, fresh.imei),
    sim: preferDetail(selected.sim, fresh.sim),
    brand: preferDetail(selected.brand, fresh.brand),
    year: preferDetail(selected.year, fresh.year),
    color: preferDetail(selected.color, fresh.color),
    engine: preferDetail(selected.engine, fresh.engine),
    dealer: preferDetail(selected.dealer, fresh.dealer),
    dealerCode: preferDetail(selected.dealerCode, fresh.dealerCode),
    serviceStatus: preferDetail(selected.serviceStatus, fresh.serviceStatus),
    phone: preferDetail(selected.phone, fresh.phone),
    email: preferDetail(selected.email, fresh.email),
    address: preferDetail(selected.address, fresh.address),
    platform: preferDetail(selected.platform, fresh.platform),
    deviceType: preferDetail(selected.deviceType, fresh.deviceType),
    networkType: preferDetail(selected.networkType, fresh.networkType),
    simType: preferDetail(selected.simType, fresh.simType),
    phase: preferDetail(selected.phase, fresh.phase),
    benefit: preferDetail(selected.benefit, fresh.benefit),
    installationDate: preferDetail(selected.installationDate, fresh.installationDate),
    startDate: preferDetail(selected.startDate, fresh.startDate),
    endDate: preferDetail(selected.endDate, fresh.endDate),
  };
}

function mergeLiveWithRecord(live: VehicleTelemetry, record: VehicleSearchRecord): VehicleTelemetry {
  return {
    ...live,
    plate: preferDetail(record.plate, live.plate) || live.plate,
    model: preferDetail(record.model, live.model) || live.model,
    owner: preferDetail(record.owner, live.owner) || live.owner,
    document: preferDetail(record.document, live.document),
    chassis: preferDetail(record.chassis, live.chassis),
    imei: preferDetail(record.imei, live.imei),
    sim: preferDetail(record.sim, live.sim),
    brand: preferDetail(record.brand, live.brand),
    year: preferDetail(record.year, live.year),
    color: preferDetail(record.color, live.color),
    engine: preferDetail(record.engine, live.engine),
    dealer: preferDetail(record.dealer, live.dealer),
    dealerCode: preferDetail(record.dealerCode, live.dealerCode),
    serviceStatus: preferDetail(record.serviceStatus, live.serviceStatus),
    phone: preferDetail(record.phone, live.phone),
    email: preferDetail(record.email, live.email),
    address: preferDetail(record.address, live.address),
    platform: preferDetail(record.platform, live.platform),
    deviceType: preferDetail(record.deviceType, live.deviceType),
    networkType: preferDetail(record.networkType, live.networkType),
    simType: preferDetail(record.simType, live.simType),
    phase: preferDetail(record.phase, live.phase),
    benefit: preferDetail(record.benefit, live.benefit),
    installationDate: preferDetail(record.installationDate, live.installationDate),
    startDate: preferDetail(record.startDate, live.startDate),
    endDate: preferDetail(record.endDate, live.endDate),
  };
}

async function enrichSelectedVehicle(vehicle: VehicleTelemetry): Promise<VehicleSearchRecord | null> {
  const terms = [vehicle.plate, vehicle.chassis, vehicle.imei, vehicle.deviceId, ...(vehicle.lookupIds ?? [])]
    .filter((term): term is string => Boolean(term && String(term).trim() && String(term).trim().toUpperCase() !== "SIN PLACA"));
  const cached = terms.map((term) => vehicleDetailCache.get(normalizeKey(term))).find(Boolean);
  if (cached) return cached;

  for (const term of terms) {
    try {
      const response = await fetch(apiUrl(`/api/vehicles/search?q=${encodeURIComponent(term)}`));
      const data = (await response.json()) as { records?: VehicleSearchRecord[] };
      const records = data.records ?? [];
      const exact = records.find((record) => sameVehicle(record, vehicle)) ?? records[0];
      if (exact) {
        [exact.plate, exact.chassis, exact.imei, exact.deviceId, ...terms]
          .filter((key): key is string => Boolean(key))
          .forEach((key) => vehicleDetailCache.set(normalizeKey(key), exact));
        return exact;
      }
    } catch {
      continue;
    }
  }

  return null;
}

async function locateSearchRecord(record: VehicleSearchRecord): Promise<VehicleTelemetry | null> {
  const terms = [record.plate, record.chassis, record.imei, record.deviceId]
    .filter((term): term is string => Boolean(term && String(term).trim() && String(term).trim().toUpperCase() !== "SIN PLACA"));
  if (!terms.length) return null;

  try {
    const response = await fetch(apiUrl(`/api/vehicles/locate?q=${encodeURIComponent(terms.join("|"))}`));
    const data = (await response.json()) as { vehicle?: Partial<VehicleTelemetry> | null };
    if (!data.vehicle || !Number.isFinite(Number(data.vehicle.lat)) || !Number.isFinite(Number(data.vehicle.lng))) return null;
    return completeLocatedVehicle(data.vehicle);
  } catch {
    return null;
  }
}

function completeLocatedVehicle(vehicle: Partial<VehicleTelemetry>): VehicleTelemetry {
  const point = { lat: Number(vehicle.lat), lng: Number(vehicle.lng) };
  const distanceToEvent = distanceKm(point, EVENT_CENTER);
  const speed = Number(vehicle.speed || 0);
  const status = (vehicle.status ?? (speed > 1 ? "MOVING" : "STOPPED")) as VehicleStatus;

  return {
    id: String(vehicle.id || vehicle.deviceId || vehicle.imei || vehicle.plate || "vehiculo-localizado"),
    deviceId: String(vehicle.deviceId || vehicle.imei || vehicle.id || ""),
    lookupIds: vehicle.lookupIds,
    plate: String(vehicle.plate || "SIN PLACA"),
    model: String(vehicle.model || "Vehiculo"),
    owner: String(vehicle.owner || "Dato real"),
    document: vehicle.document,
    chassis: vehicle.chassis,
    imei: vehicle.imei,
    sim: vehicle.sim,
    brand: vehicle.brand,
    year: vehicle.year,
    color: vehicle.color,
    engine: vehicle.engine,
    dealer: vehicle.dealer,
    dealerCode: vehicle.dealerCode,
    serviceStatus: vehicle.serviceStatus,
    phone: vehicle.phone,
    email: vehicle.email,
    address: vehicle.address,
    platform: vehicle.platform,
    deviceType: vehicle.deviceType,
    networkType: vehicle.networkType,
    simType: vehicle.simType,
    phase: vehicle.phase,
    benefit: vehicle.benefit,
    installationDate: vehicle.installationDate,
    startDate: vehicle.startDate,
    endDate: vehicle.endDate,
    lat: point.lat,
    lng: point.lng,
    speed,
    heading: Number(vehicle.heading || 0),
    ignition: Boolean(vehicle.ignition),
    satellites: Number(vehicle.satellites || 0),
    timestamp: Number(vehicle.timestamp || Date.now()),
    status,
    distanceToEvent,
    etaToEvent: etaMinutes(distanceToEvent, speed),
    approachCorridor: corridorFor(point),
    trail: vehicle.trail?.length ? vehicle.trail : [point],
    route: vehicle.route?.length ? vehicle.route : [point],
    lastEvent: statusLabel(status),
  };
}

function sameVehicle(record: VehicleSearchRecord, vehicle: VehicleTelemetry) {
  const recordKeys = [record.plate, record.chassis, record.imei, record.deviceId].filter(Boolean).map((item) => normalizeKey(String(item)));
  return [vehicle.plate, vehicle.chassis, vehicle.imei, vehicle.deviceId, ...(vehicle.lookupIds ?? [])]
    .filter(Boolean)
    .some((item) => recordKeys.includes(normalizeKey(String(item))));
}

function preferDetail<T>(primaryValue: T | undefined, fallbackValue: T | undefined) {
  return hasUsefulValue(primaryValue) ? primaryValue : fallbackValue;
}

function hasUsefulValue(value: unknown) {
  if (value === undefined || value === null) return false;
  const text = String(value).trim().toUpperCase();
  return Boolean(
    text &&
    text !== "PENDIENTE" &&
    text !== "CLIENTE PENDIENTE" &&
    text !== "CLIENTE PENDIENTE EN BASE" &&
    text !== "DATO REAL" &&
    text !== "DATO VAPOR PENDIENTE" &&
    text !== "SIN PLACA"
  );
}

function normalizeKey(value: string) {
  return value.trim().replace(/[-_\s.]/g, "").toUpperCase();
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      <span>{text}</span>
    </div>
  );
}

function EmptyOverlay({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty-overlay">
      <div className="data-loader" aria-label={`${title}. ${text}`}>
        <i />
        <i />
        <i />
        <b />
      </div>
    </div>
  );
}

function PanelTitle({ title }: { title: string }) {
  return <h2 className="panel-title">{title}</h2>;
}
