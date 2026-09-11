import cors from "cors";
import express from "express";
import { createServer } from "node:http";
import path from "node:path";
import { Server } from "socket.io";
import { config } from "./config";
import { pool } from "./db/pool";
import { FlespiService } from "./services/flespi.service";
import { TraccarService } from "./services/traccar.service";
import { VaporService } from "./services/vapor.service";
import { latestVehicles, savePositions, todayRouteByDeviceId } from "./repositories/vehicle.repository";

const app = express();
const httpServer = createServer(app);
const allowedOrigins = new Set([
  config.frontendOrigin,
  "http://127.0.0.1:5177",
  "http://127.0.0.1:5178",
  "http://127.0.0.1:5179",
  "http://localhost:5177",
  "http://localhost:5178",
  "http://localhost:5179",
]);
const corsOptions: cors.CorsOptions = {
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin) || /^http:\/\/(localhost|127\.0\.0\.1):51\d{2}$/.test(origin)) return callback(null, true);
    return callback(null, false);
  },
};
const io = new Server(httpServer, {
  cors: corsOptions,
});
const flespi = new FlespiService({ token: config.flespi.token, baseUrl: config.flespi.baseUrl });
const traccar = new TraccarService(config.traccar);
const vapor = new VaporService(config.vaporDb);
const EVENT_GEOFENCE_ID = 982;

app.use(cors(corsOptions));
app.use(express.json());

app.get("/api/health", async (_request, response) => {
  const db = await checkDatabase();
  response.json({
    ok: true,
    database: db,
    flespiConfigured: Boolean(config.flespi.token),
    traccarConfigured: traccar.isConfigured(),
    vaporConfigured: vapor.isConfigured(),
    websocket: "ready",
  });
});

app.get("/api/vehicles", async (_request, response, next) => {
  try {
    response.json({ vehicles: await latestVehicles() });
  } catch (error) {
    next(error);
  }
});

app.get("/api/vehicles/live", async (_request, response, next) => {
  try {
    if (traccar.isConfigured()) {
      try {
        const vehicles = await withTimeout(traccar.getLiveVehicles(), 10000, "Traccar timeout");
        if (vehicles.length) {
          persistPositions(vehicles);
          return response.json({ source: "traccar", vehicles });
        }
      } catch (error) {
        console.warn(error instanceof Error ? error.message : "Traccar unavailable");
      }
    }

    if (config.flespi.token) {
      try {
        const vehicles = await withTimeout(flespi.getLiveVehicles(), 7000, "Flespi timeout");
        if (vehicles.length) {
          persistPositions(vehicles);
          return response.json({ source: "flespi", vehicles });
        }
      } catch (error) {
        console.warn(error instanceof Error ? error.message : "Flespi unavailable");
      }
    }

    const vehicles = await latestVehicles();
    return response.json({ source: "database", vehicles });
  } catch (error) {
    next(error);
  }
});

app.get("/api/vehicles/search", async (request, response, next) => {
  try {
    const query = String(request.query.q ?? "").trim();
    if (!query) return response.json({ records: [] });
    const records = await withTimeout(vapor.searchVehicles(query, 100), 7000, "Busqueda Vapor timeout");
    response.json({ records });
  } catch (error) {
    next(error);
  }
});

app.get("/api/vehicles/locate", async (request, response, next) => {
  try {
    const terms = String(request.query.q ?? "")
      .split("|")
      .map((term) => term.trim())
      .filter(Boolean);

    if (!terms.length) return response.json({ vehicle: null });

    if (traccar.isConfigured()) {
      try {
        const vehicle = await withTimeout(traccar.findLiveVehicleByTerms(terms), 9000, "Ubicacion Traccar timeout");
        if (vehicle) {
          const [enriched] = await enrichWithVapor([vehicle]);
          persistPositions([enriched]);
          return response.json({ source: "traccar", vehicle: enriched });
        }
      } catch (error) {
        console.warn(error instanceof Error ? error.message : "Traccar locate unavailable");
      }
    }

    if (config.flespi.token) {
      try {
        const vehicle = await withTimeout(flespi.findLiveVehicleByTerms(terms), 12000, "Ubicacion Flespi timeout");
        if (vehicle) {
          const [enriched] = await enrichWithVapor([vehicle]);
          persistPositions([enriched]);
          return response.json({ source: "flespi", vehicle: enriched });
        }
      } catch (error) {
        console.warn(error instanceof Error ? error.message : "Flespi locate unavailable");
      }
    }

    response.json({ vehicle: null });
  } catch (error) {
    next(error);
  }
});

app.get("/api/vehicles/:deviceId/route/today", async (request, response, next) => {
  try {
    const rows = await todayRouteByDeviceId(request.params.deviceId);
    const first = rows[0];
    const last = rows[rows.length - 1];
    const movingPoints = rows.filter((row) => Number(row.speed) > 3);
    response.json({
      deviceId: request.params.deviceId,
      points: rows,
      summary: {
        totalPoints: rows.length,
        firstTime: first?.time ?? null,
        lastTime: last?.time ?? null,
        movingPoints: movingPoints.length,
        maxSpeed: rows.reduce((max, row) => Math.max(max, Number(row.speed || 0)), 0),
      },
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/flespi/devices", async (_request, response, next) => {
  try {
    response.json(await flespi.getDevices());
  } catch (error) {
    next(error);
  }
});

app.get("/api/traccar/devices", async (_request, response, next) => {
  try {
    response.json(await traccar.getDevices());
  } catch (error) {
    next(error);
  }
});

app.get("/api/geofence/event", async (_request, response, next) => {
  try {
    const geofence = await traccar.getGeofence(EVENT_GEOFENCE_ID);
    if (!geofence) return response.status(404).json({ error: "Geocerca del evento no encontrada" });

    const points = parseTraccarPolygon(geofence.area);
    if (points.length < 3) return response.status(422).json({ error: "Geocerca del evento invalida" });

    return response.json({
      source: "traccar",
      id: geofence.id,
      name: geofence.name,
      points,
    });
  } catch (error) {
    return next(error);
  }
});

const frontendPath = path.resolve(process.cwd(), "dist");
app.use(express.static(frontendPath, {
  setHeaders(response, filePath) {
    if (path.basename(filePath) === "index.html") {
      response.setHeader("Cache-Control", "no-store");
    }
  },
}));
app.use((request, response, next) => {
  if (request.method === "GET" && request.accepts("html")) {
    response.setHeader("Cache-Control", "no-store");
    return response.sendFile(path.join(frontendPath, "index.html"));
  }
  return next();
});

io.on("connection", (socket) => {
  socket.emit("system:ready", {
    flespiConfigured: Boolean(config.flespi.token),
    traccarConfigured: traccar.isConfigured(),
    vaporConfigured: vapor.isConfigured(),
    timestamp: Date.now(),
  });
});

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  const message = error instanceof Error ? error.message : "Unexpected server error";
  response.status(500).json({ error: message });
});

httpServer.listen(config.serverPort, "0.0.0.0", () => {
  console.log(`ToyotaFest listening on port ${config.serverPort}`);
});

async function checkDatabase() {
  try {
    await withTimeout(pool.query("SELECT 1"), 3000, "Database timeout");
    return "connected";
  } catch {
    return "unavailable";
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string) {
  return Promise.race([
    promise,
    new Promise<T>((_resolve, reject) => {
      setTimeout(() => reject(new Error(message)), ms);
    }),
  ]);
}

function persistPositions(vehicles: Parameters<typeof savePositions>[0]) {
  void savePositions(vehicles).catch((error) => {
    console.warn(error instanceof Error ? error.message : "Could not persist vehicle positions");
  });
}

async function enrichWithVapor(vehicles: Parameters<typeof savePositions>[0]) {
  try {
    return await withTimeout(vapor.enrichVehicles(vehicles), 5000, "Vapor timeout");
  } catch (error) {
    console.warn(error instanceof Error ? error.message : "Vapor unavailable");
    return vehicles.map((vehicle) => ({
      ...vehicle,
      plate: /^\d{10,}$/.test(String(vehicle.plate ?? "")) ? "SIN PLACA" : vehicle.plate,
    }));
  }
}

function parseTraccarPolygon(area: string) {
  const match = area.match(/^POLYGON\s*\(\((.+)\)\)$/i);
  if (!match) return [];

  return match[1]
    .split(",")
    .map((pair) => pair.trim().split(/\s+/).map(Number))
    .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng))
    .map(([lat, lng]) => ({ lat, lng }));
}
