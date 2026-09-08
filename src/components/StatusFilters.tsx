import type { VehicleStatus } from "../types";
import { statusLabel } from "../utils/labels";

const filters: Array<VehicleStatus | "ALL"> = ["ALL", "APPROACHING", "ARRIVING", "AT_EVENT", "MOVING", "STOPPED", "DEPARTING", "OFFLINE"];

export function StatusFilters({ active, onChange }: { active: VehicleStatus | "ALL"; onChange: (status: VehicleStatus | "ALL") => void }) {
  return (
    <div className="filters">
      {filters.map((filter) => (
        <button key={filter} className={active === filter ? "active" : ""} onClick={() => onChange(filter)}>
          {filter === "ALL" ? "TODOS" : statusLabel(filter)}
        </button>
      ))}
    </div>
  );
}
