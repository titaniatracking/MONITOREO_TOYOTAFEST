# Toyota Experience Fest Live Tracking

Sistema de monitoreo vehicular estilo radar operacional para Toyota Experience Fest, centrado sobre mapa de Quito y preparado para datos reales de Flespi.

## Ejecutar

```bash
npm install
npm run dev
```

URL local:

```text
http://127.0.0.1:5177/
```

Backend local:

```bash
npm run dev:server
```

API:

```text
http://127.0.0.1:8087/api/health
```

Frontend + backend:

```bash
npm run dev:all
```

## Base de datos

La primera base MySQL creada para el sistema es:

```text
toyotafest_monitoring
```

Migracion:

```bash
npm run db:migrate
```

Configurar credenciales mediante variables de entorno o archivo `.env` local. El archivo `.env` no debe subirse al repositorio.

## Incluye en esta primera version

- Layout principal tipo centro de control.
- Mapa real de Quito con capa visual estilo radar.
- Zoom de mapa con botones y rueda del mouse.
- Centro del evento, anillos de distancia y corredores de aproximacion.
- Lectura de vehiculos reales desde backend, Flespi y MySQL.
- Marcadores tipo objetivo movil, heading, vector y trail.
- Calculo de distancia y ETA.
- Feed operacional, filtros, busqueda y panel lateral.
- Follow vehicle, replay basico, radar mode, cinematic mode y heatmap visual.

## Datos reales

El frontend consulta:

```text
http://127.0.0.1:8087/api/vehicles/live
```

Prioridad de datos:

1. Flespi, cuando `FLESPI_TOKEN` esta configurado.
2. Ultimas posiciones guardadas en MySQL.

Cuando llegan datos de Flespi, el backend normaliza la telemetria y guarda posiciones en MySQL. Si no existe token ni posiciones guardadas, la pantalla queda vacia e informa que faltan datos reales.

## Siguiente etapa

Agregar `FLESPI_TOKEN` y activar la ingesta real de telemetria. El token nunca debe exponerse en frontend.
