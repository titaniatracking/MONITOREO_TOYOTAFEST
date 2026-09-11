import { useEffect, useState } from "react";
import { CalendarDays } from "lucide-react";
import { apiUrl } from "../utils/api";

interface EntryRecord {
  id: string;
  plate?: string;
  model?: string;
  owner?: string;
  time: string;
}

interface HourlyEntry {
  hour: number;
  total: number;
}

export function ActivityFeed() {
  const [date, setDate] = useState(todayLocal());
  const [entries, setEntries] = useState<EntryRecord[]>([]);
  const [hourly, setHourly] = useState<HourlyEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const loadEntries = async () => {
      try {
        const response = await fetch(apiUrl(`/api/events/entries?date=${encodeURIComponent(date)}`));
        const data = (await response.json()) as { entries?: EntryRecord[]; hourly?: HourlyEntry[] };
        if (!cancelled && response.ok) {
          setEntries(data.entries ?? []);
          setHourly(data.hourly ?? []);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    setLoading(true);
    loadEntries();
    const timer = window.setInterval(loadEntries, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [date]);

  return (
    <aside className="activity-feed">
      <div className="panel-heading">
        <span>INGRESOS AL EVENTO</span>
        <b>{entries.length}</b>
      </div>
      <label className="entry-date-control">
        <CalendarDays size={15} />
        <input type="date" value={date} max={todayLocal()} onChange={(event) => setDate(event.target.value)} />
      </label>
      {hourly.length > 0 && (
        <div className="hourly-entry-summary">
          {hourly.map((item) => <span key={item.hour}><b>{String(item.hour).padStart(2, "0")}:00</b>{item.total}</span>)}
        </div>
      )}
      <div className="feed-list">
        {!loading && !entries.length && <div className="entry-empty">Sin ingresos registrados en esta fecha.</div>}
        {entries.map((entry) => (
          <div key={entry.id} className="feed-item status-at_event">
            <time>{entry.time}</time>
            <strong>{entry.plate || "SIN PLACA"}</strong>
            <span>{entry.owner || "Cliente pendiente"}</span>
            <small>{entry.model || "Modelo pendiente"}</small>
          </div>
        ))}
      </div>
    </aside>
  );
}

function todayLocal() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
