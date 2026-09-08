import { useEffect, useState } from "react";
import { apiUrl } from "../utils/api";

interface BackendHealth {
  ok: boolean;
  database: "connected" | "unavailable";
  flespiConfigured: boolean;
  traccarConfigured: boolean;
  vaporConfigured: boolean;
  websocket: string;
}

export function useBackendHealth() {
  const [health, setHealth] = useState<BackendHealth | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch(apiUrl("/api/health"));
        const data = (await response.json()) as BackendHealth;
        if (!cancelled) setHealth(data);
      } catch {
        if (!cancelled) setHealth(null);
      }
    };

    load();
    const timer = window.setInterval(load, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  return health;
}
