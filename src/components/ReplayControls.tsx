import { Pause, Play } from "lucide-react";

export function ReplayControls({ active, onToggle }: { active: boolean; onToggle: () => void }) {
  return (
    <div className="replay-controls">
      <button onClick={onToggle}>{active ? <Pause size={16} /> : <Play size={16} />}</button>
      <span>REPRODUCCION</span>
      <div className="replay-track">
        <i style={{ width: active ? "68%" : "24%" }} />
      </div>
      <button>1x</button>
      <button>2x</button>
      <button>5x</button>
    </div>
  );
}
