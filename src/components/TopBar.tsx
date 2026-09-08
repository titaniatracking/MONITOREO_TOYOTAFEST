import { RadioTower } from "lucide-react";

interface TopBarProps {
  stats: {
    online: number;
    moving: number;
    approaching: number;
    atEvent: number;
    offline: number;
  };
  lastUpdate: Date;
}

export function TopBar({ stats, lastUpdate }: TopBarProps) {
  const time = lastUpdate.toLocaleTimeString("es-EC", { hour12: false });

  return (
    <header className="topbar">
      <div className="topbar-title">
        <RadioTower size={18} />
        <div>
          <strong><span>TOYOTA</span> EXPERIENCE FEST</strong>
          <small>MONITOREO VEHICULAR EN TIEMPO REAL - QUITO</small>
        </div>
      </div>
      <div className="topbar-stats">
        <span className="live-dot">EN VIVO</span>
        <Metric label="EN LINEA" value={stats.online} />
        <Metric label="MOVIENDOSE" value={stats.moving} />
        <Metric label="APROXIMANDO" value={stats.approaching} />
        <Metric label="EN EVENTO" value={stats.atEvent} />
        <Metric label="SIN SENAL" value={stats.offline} />
        <Metric label="ULTIMA ACT." value={time} />
      </div>
    </header>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <span className="metric">
      <b>{value}</b>
      <small>{label}</small>
    </span>
  );
}
