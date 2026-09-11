import { CalendarDays, CalendarRange, CarFront, Clock3, LogIn } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { apiUrl } from "../utils/api";

interface ReportRow {
  date: string;
  total: number;
  uniqueVehicles: number;
}

interface HourRow {
  hour: number;
  total: number;
  uniqueVehicles: number;
}

interface EntryRow {
  id: string;
  plate?: string;
  model?: string;
  owner?: string;
  date: string;
  time: string;
}

interface ReportData {
  summary: { totalEntries: number; uniqueVehicles: number; activeDays: number };
  daily: ReportRow[];
  hourly: HourRow[];
  entries: EntryRow[];
}

const emptyReport: ReportData = {
  summary: { totalEntries: 0, uniqueVehicles: 0, activeDays: 0 },
  daily: [],
  hourly: [],
  entries: [],
};

export function EventReports() {
  const [dateFrom, setDateFrom] = useState(() => offsetDate(-6));
  const [dateTo, setDateTo] = useState(todayLocal);
  const [report, setReport] = useState<ReportData>(emptyReport);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    const loadReport = async () => {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(apiUrl(`/api/reports/event-entries?from=${encodeURIComponent(dateFrom)}&to=${encodeURIComponent(dateTo)}`), { signal: controller.signal });
        if (!response.ok) throw new Error("No se pudo cargar el reporte");
        const data = (await response.json()) as ReportData;
        setReport({
          summary: data.summary ?? emptyReport.summary,
          daily: data.daily ?? [],
          hourly: data.hourly ?? [],
          entries: data.entries ?? [],
        });
      } catch (requestError) {
        if (!controller.signal.aborted) {
          setReport(emptyReport);
          setError(requestError instanceof Error ? requestError.message : "No se pudo cargar el reporte");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    loadReport();
    return () => controller.abort();
  }, [dateFrom, dateTo]);

  const hourly = useMemo(() => Array.from({ length: 24 }, (_, hour) => report.hourly.find((item) => Number(item.hour) === hour) ?? { hour, total: 0, uniqueVehicles: 0 }), [report.hourly]);
  const peakHour = hourly.reduce((peak, item) => Number(item.total) > Number(peak.total) ? item : peak, hourly[0]);
  const maxDaily = Math.max(1, ...report.daily.map((item) => Number(item.total)));
  const maxHourly = Math.max(1, ...hourly.map((item) => Number(item.total)));

  const setPreset = (days: number) => {
    setDateFrom(offsetDate(-(days - 1)));
    setDateTo(todayLocal());
  };

  return (
    <div className="event-reports">
      <div className="report-toolbar">
        <div className="report-date-range">
          <CalendarRange size={17} />
          <label>Desde<input type="date" value={dateFrom} max={dateTo} onChange={(event) => setDateFrom(event.target.value)} /></label>
          <label>Hasta<input type="date" value={dateTo} min={dateFrom} max={todayLocal()} onChange={(event) => setDateTo(event.target.value)} /></label>
        </div>
        <div className="report-presets">
          <button onClick={() => setPreset(1)}>Hoy</button>
          <button onClick={() => setPreset(7)}>7 dias</button>
          <button onClick={() => setPreset(30)}>30 dias</button>
        </div>
      </div>

      <div className="report-kpis">
        <ReportKpi icon={<LogIn size={20} />} label="Ingresos registrados" value={report.summary.totalEntries} tone="red" />
        <ReportKpi icon={<CarFront size={20} />} label="Vehiculos unicos" value={report.summary.uniqueVehicles} tone="green" />
        <ReportKpi icon={<CalendarDays size={20} />} label="Dias con ingresos" value={report.summary.activeDays} tone="blue" />
        <ReportKpi icon={<Clock3 size={20} />} label="Hora pico" value={peakHour.total ? `${String(peakHour.hour).padStart(2, "0")}:00` : "--"} tone="purple" />
      </div>

      {loading && <div className="report-state">Actualizando ingresos...</div>}
      {error && <div className="report-state error-text">{error}</div>}

      <div className="report-charts">
        <section className="report-chart-panel">
          <h3>INGRESOS POR DIA</h3>
          <div className="daily-bars">
            {!report.daily.length && !loading && <span className="report-empty">Sin ingresos en el rango seleccionado.</span>}
            {report.daily.map((item) => (
              <div className="report-bar-row" key={item.date}>
                <time>{formatShortDate(item.date)}</time>
                <span><i style={{ width: `${Math.max(3, Number(item.total) / maxDaily * 100)}%` }} /></span>
                <b>{item.total}</b>
              </div>
            ))}
          </div>
        </section>

        <section className="report-chart-panel">
          <h3>INGRESOS POR HORA</h3>
          <div className="hour-bars">
            {hourly.map((item) => (
              <div key={item.hour} title={`${String(item.hour).padStart(2, "0")}:00 - ${item.total} ingresos`}>
                <b>{item.total || ""}</b>
                <span><i style={{ height: `${Number(item.total) ? Math.max(8, Number(item.total) / maxHourly * 100) : 2}%` }} /></span>
                <small>{String(item.hour).padStart(2, "0")}</small>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="report-entry-table">
        <header><h3>DETALLE DE INGRESOS</h3><span>{report.entries.length} registros visibles</span></header>
        <div className="report-entry-scroll">
          <table>
            <thead><tr><th>Fecha</th><th>Hora</th><th>Placa</th><th>Cliente</th><th>Vehiculo</th></tr></thead>
            <tbody>
              {report.entries.map((entry) => (
                <tr key={entry.id}><td>{formatShortDate(entry.date)}</td><td>{entry.time}</td><td><b>{entry.plate || "SIN PLACA"}</b></td><td>{entry.owner || "Cliente pendiente"}</td><td>{entry.model || "Modelo pendiente"}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function ReportKpi({ icon, label, value, tone }: { icon: ReactNode; label: string; value: string | number; tone: string }) {
  return <div className={`report-kpi ${tone}`}><span>{icon}</span><small>{label}</small><strong>{value}</strong></div>;
}

function todayLocal() {
  return offsetDate(0);
}

function offsetDate(days: number) {
  const value = new Date();
  value.setDate(value.getDate() + days);
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatShortDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year.slice(2)}`;
}
