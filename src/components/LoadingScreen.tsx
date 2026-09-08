import { useEffect, useState } from "react";

const TOYOTA_LOGO_URL = "/experiencefest/experience-fest-alt-Suxh23_l.png";

const steps = [
  "Inicializando radar vehicular",
  "Cargando mapa de Quito",
  "Cargando perimetro del evento",
  "Conectando relay Flespi",
  "Recibiendo telemetria en vivo",
  "Sistema listo",
];

export function LoadingScreen() {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => setStep((current) => Math.min(current + 1, steps.length - 1)), 360);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="loading-screen">
      <div className="loading-ring">
        <img src={TOYOTA_LOGO_URL} alt="Toyota" />
      </div>
      <p className="brand-kicker">TOYOTA EXPERIENCE FEST</p>
      <h1>MONITOREO VEHICULAR EN TIEMPO REAL</h1>
      <div className="loading-step">{steps[step]}...</div>
    </div>
  );
}
