import mysql, { type Pool, type RowDataPacket } from "mysql2/promise";
import type { VehicleTelemetry } from "../utils/telemetry";

export interface VaporDbConfig {
  host: string;
  user: string;
  password: string;
  port: number;
  database: string;
  baseDatabase: string;
  customerDatabase: string;
  centralHost?: string;
  centralUser?: string;
  centralPassword?: string;
  centralPort?: number;
  centralDatabase?: string;
}

interface VaporVehicle {
  idFlespi?: string;
  traccarDeviceId?: string;
  imei?: string;
  sim?: string;
  plate?: string;
  chassis?: string;
  brand?: string;
  model?: string;
  year?: string | number;
  color?: string;
  engine?: string;
  dealer?: string;
  dealerCode?: string;
  serviceStatus?: string;
  owner?: string;
  document?: string;
  phone?: string;
  email?: string;
  address?: string;
  platform?: string;
  deviceType?: string;
  networkType?: string;
  simType?: string;
  phase?: string;
  benefit?: string;
  installationDate?: string;
  startDate?: string;
  endDate?: string;
}

interface VaporCustomer {
  plate?: string;
  chassis?: string;
  customer?: string;
  document?: string;
}

const CACHE_TTL_MS = 5 * 60 * 1000;

export class VaporService {
  private readonly vehiclePool?: Pool;
  private readonly basePool?: Pool;
  private readonly customerPool?: Pool;
  private readonly centralPool?: Pool;
  private vehicleCache = new Map<string, { expiresAt: number; value: VaporVehicle }>();
  private customerCache = new Map<string, { expiresAt: number; value: VaporCustomer }>();

  constructor(private readonly config: VaporDbConfig) {
    if (this.isConfigured()) {
      const shared = {
        host: config.host,
        user: config.user,
        password: config.password,
        port: config.port,
        waitForConnections: true,
        connectionLimit: 4,
        namedPlaceholders: false,
      };
      this.vehiclePool = mysql.createPool({
        ...shared,
        database: config.database,
      });
      this.basePool = mysql.createPool({
        ...shared,
        database: config.baseDatabase,
      });
      this.customerPool = mysql.createPool({
        ...shared,
        database: config.customerDatabase,
      });
    }
    if (config.centralHost && config.centralUser && config.centralPassword) {
      this.centralPool = mysql.createPool({
        host: config.centralHost,
        user: config.centralUser,
        password: config.centralPassword,
        port: config.centralPort ?? 3306,
        database: config.centralDatabase ?? "s3s_facturacion",
        waitForConnections: true,
        connectionLimit: 4,
        namedPlaceholders: false,
      });
    }
  }

  isConfigured() {
    return Boolean(this.config.host && this.config.user && this.config.password && this.config.database);
  }

  async enrichVehicles(vehicles: VehicleTelemetry[]) {
    if (!vehicles.length) return vehicles;
    if (!this.vehiclePool) return vehicles.map((vehicle) => sanitizeVehicle(vehicle));

    const vaporVehicles = await this.lookupVehicles(vehicles);
    const enriched = vehicles.map((vehicle) => {
      const match =
        [vehicle.deviceId, vehicle.plate, ...(vehicle.lookupIds ?? [])]
          .map((value) => vaporVehicles.get(normalizePlate(String(value ?? ""))))
          .find(Boolean) ?? undefined;
      const matched = match
        ? {
        ...vehicle,
        plate: safePlate(match.plate) || vehicle.plate,
        model: [match.brand, match.model, match.year].filter(Boolean).join(" ") || vehicle.model,
        chassis: match.chassis || vehicle.chassis,
        imei: match.imei || vehicle.imei,
        sim: match.sim || vehicle.sim,
        brand: match.brand || vehicle.brand,
        year: match.year || vehicle.year,
        color: match.color || vehicle.color,
        engine: match.engine || vehicle.engine,
        dealer: match.dealer || vehicle.dealer,
        dealerCode: match.dealerCode || vehicle.dealerCode,
        serviceStatus: match.serviceStatus || vehicle.serviceStatus,
        phone: match.phone || vehicle.phone,
        email: match.email || vehicle.email,
        address: match.address || vehicle.address,
        platform: match.platform || vehicle.platform,
        deviceType: match.deviceType || vehicle.deviceType,
        networkType: match.networkType || vehicle.networkType,
        simType: match.simType || vehicle.simType,
        phase: match.phase || vehicle.phase,
        benefit: match.benefit || vehicle.benefit,
        installationDate: match.installationDate || vehicle.installationDate,
        startDate: match.startDate || vehicle.startDate,
        endDate: match.endDate || vehicle.endDate,
          }
        : vehicle;
      return sanitizeVehicle(matched);
    });

    const customers = await this.lookupCustomers(enriched).catch(() => new Map<string, VaporCustomer>());
    return enriched.map((vehicle) => {
      const customer = customers.get(normalizePlate(vehicle.chassis)) ?? customers.get(normalizePlate(vehicle.plate));
      return sanitizeVehicle({
        ...vehicle,
        owner: customer?.customer || vehicle.owner,
        document: customer?.document || vehicle.document,
        plate: safePlate(vehicle.plate) || "SIN PLACA",
      });
    });
  }

  async searchVehicles(query: string, limit = 80) {
    const term = normalizeSearch(query);
    if (!term || !this.vehiclePool) return [];
    const baseRows = await this.searchBaseRecords(term, limit);
    const authoritativeRows = await this.searchCentralRecords(term, limit).catch(() => []);
    const customerMatches = await this.searchCustomers(term, limit).catch(() => []);
    const customerPlates = Array.from(new Set(customerMatches.map((row) => normalizePlate(row.plate)).filter(Boolean)));
    const customerChassis = Array.from(new Set(customerMatches.map((row) => normalizePlate(row.chassis)).filter(Boolean)));
    const platePlaceholders = customerPlates.length ? customerPlates.map(() => "?").join(",") : "NULL";
    const chassisPlaceholders = customerChassis.length ? customerChassis.map(() => "?").join(",") : "NULL";

    const [centralRows] = await this.vehiclePool.query<RowDataPacket[]>(
      `SELECT
         d.imei,
         d.sim,
         CAST(d.flespi_device_id AS CHAR) idFlespi,
         CAST(d.traccar_device_id AS CHAR) traccarDeviceId,
         v.chasis chassis,
         v.plate plate,
         v.brand brand,
         v.model model,
         v.year year,
         v.color color,
         v.engine engine,
         cc.name dealer,
         cc.code dealerCode,
         vd.vehicle_device_status serviceStatus,
         DATE_FORMAT(vd.installation_date, '%Y-%m-%d') installationDate,
         DATE_FORMAT(vd.start_date, '%Y-%m-%d') startDate,
         DATE_FORMAT(vd.end_date, '%Y-%m-%d') endDate
       FROM devices d
       LEFT JOIN vehicle_devices vd ON vd.device_id = d.id AND vd.deleted_at IS NULL
       LEFT JOIN vehicles v ON v.id = vd.vehicle_id AND v.deleted_at IS NULL
       LEFT JOIN cost_centers cc ON cc.id = v.cost_center_id
       WHERE d.deleted_at IS NULL
         AND (
           REPLACE(UPPER(COALESCE(d.imei, '')), ' ', '') LIKE ?
           OR REPLACE(UPPER(COALESCE(d.sim, '')), ' ', '') LIKE ?
           OR REPLACE(UPPER(COALESCE(d.flespi_device_id, '')), ' ', '') LIKE ?
           OR REPLACE(UPPER(COALESCE(d.traccar_device_id, '')), ' ', '') LIKE ?
           OR REPLACE(UPPER(COALESCE(v.chasis, '')), ' ', '') LIKE ?
           OR REPLACE(UPPER(COALESCE(v.plate, '')), ' ', '') LIKE ?
           OR REPLACE(UPPER(COALESCE(v.brand, '')), ' ', '') LIKE ?
           OR REPLACE(UPPER(COALESCE(v.model, '')), ' ', '') LIKE ?
           OR REPLACE(UPPER(COALESCE(cc.name, '')), ' ', '') LIKE ?
           OR REPLACE(UPPER(COALESCE(v.plate, '')), ' ', '') IN (${platePlaceholders})
           OR REPLACE(UPPER(COALESCE(v.chasis, '')), ' ', '') IN (${chassisPlaceholders})
         )
       ORDER BY
         (vd.end_date IS NULL OR vd.end_date >= CURRENT_DATE) DESC,
         vd.start_date DESC,
         vd.id DESC
       LIMIT ?`,
      [...Array(9).fill(`%${term}%`), ...customerPlates, ...customerChassis, limit]
    );

    const rowsByKey = new Map<string, VaporVehicle>();
    for (const record of baseRows) {
      rowsByKey.set(recordKey(record), record);
    }
    for (const row of centralRows) {
      const record = row as VaporVehicle;
      const key = recordKey(record);
      rowsByKey.set(key, { ...rowsByKey.get(key), ...record });
    }
    for (const record of authoritativeRows) {
      const key = recordKey(record);
      rowsByKey.set(key, mergePreferred(rowsByKey.get(key), record));
    }
    for (const customer of customerMatches) {
      const key = recordKey({ plate: customer.plate, chassis: customer.chassis });
      if (!rowsByKey.has(key)) {
        rowsByKey.set(key, {
          plate: customer.plate,
          chassis: customer.chassis,
        });
      }
    }
    const rows = Array.from(rowsByKey.values()).slice(0, limit);
    const customerByKey = await this.lookupCustomers(
      rows.map((row) => ({
        deviceId: row.imei || row.idFlespi || row.traccarDeviceId || "",
        plate: row.plate,
        chassis: row.chassis,
        lat: 0,
        lng: 0,
        speed: 0,
        timestamp: Date.now(),
        status: "OFFLINE",
      }))
    ).catch(() => new Map<string, VaporCustomer>());

    return rows.map((row) => {
      const customer =
        customerByKey.get(row.chassis || "") ??
        customerByKey.get(normalizePlate(row.chassis)) ??
        customerByKey.get(normalizePlate(row.plate)) ??
        customerMatches.find((match) => normalizePlate(match.plate) === normalizePlate(row.plate) || normalizePlate(match.chassis) === normalizePlate(row.chassis));
      return sanitizeRecord({
        ...row,
        owner: row.owner || customer?.customer,
        document: row.document || customer?.document,
      });
    });
  }

  private async searchBaseRecords(term: string, limit: number) {
    if (!this.basePool) return [];
    const like = `%${term}%`;
    const [rows] = await this.basePool.query<RowDataPacket[]>(
      `SELECT
         imei,
         sim,
         chasis chassis,
         placa plate,
         marca brand,
         modelo model,
         anio_vehiculo year,
         color,
         dealer,
         estado_vehiculo serviceStatus,
         nombre_cliente owner,
         cedula document,
         telefono phone,
         email,
         direccion address,
         plataforma platform,
         tipo_dispositivo deviceType,
         tipo_red networkType,
         tipo_sim simType,
         fase_proceso phase,
         promocion benefit,
         DATE_FORMAT(fecha_instalacion, '%Y-%m-%d') installationDate,
         DATE_FORMAT(fecha_inicio, '%Y-%m-%d') startDate,
         DATE_FORMAT(fecha_vencimiento_actual, '%Y-%m-%d') endDate
       FROM Base_V1
       WHERE
         REPLACE(UPPER(COALESCE(codigo_unico, '')), ' ', '') LIKE ?
         OR REPLACE(UPPER(COALESCE(cedula, '')), ' ', '') LIKE ?
         OR REPLACE(UPPER(COALESCE(nombre_cliente, '')), ' ', '') LIKE ?
         OR REPLACE(UPPER(COALESCE(chasis, '')), ' ', '') LIKE ?
         OR REPLACE(UPPER(COALESCE(placa, '')), ' ', '') LIKE ?
         OR REPLACE(UPPER(COALESCE(imei, '')), ' ', '') LIKE ?
         OR REPLACE(UPPER(COALESCE(sim, '')), ' ', '') LIKE ?
         OR REPLACE(UPPER(COALESCE(dealer, '')), ' ', '') LIKE ?
         OR REPLACE(UPPER(COALESCE(plataforma, '')), ' ', '') LIKE ?
       ORDER BY
         (fecha_vencimiento_actual IS NULL OR fecha_vencimiento_actual >= CURRENT_DATE) DESC,
         fecha_inicio DESC,
         ID DESC
       LIMIT ?`,
      [...Array(9).fill(like), limit]
    );
    return rows.map((row) => row as VaporVehicle);
  }

  private async searchCentralRecords(term: string, limit: number) {
    if (!this.centralPool) return [];
    const like = `%${term}%`;
    const [rows] = await this.centralPool.query<RowDataPacket[]>(
      `SELECT
         imei,
         sim,
         chasis chassis,
         placa plate,
         marca brand,
         modelo,
         anio year,
         JSON_UNQUOTE(JSON_EXTRACT(data, '$.color')) color,
         dealer,
         dealer_crm dealerCode,
         estado_vehiculo serviceStatus,
         cliente owner,
         cedula document,
         telefono phone,
         email,
         JSON_UNQUOTE(JSON_EXTRACT(data, '$.direccion')) address,
         dealer platform,
         tipo_dispositivo deviceType,
         tipo_red_equipo networkType,
         tipo_sim simType,
         JSON_UNQUOTE(JSON_EXTRACT(data, '$.fase')) phase,
         beneficios benefit,
         JSON_UNQUOTE(JSON_EXTRACT(data, '$.fecha_instalacion')) installationDate,
         JSON_UNQUOTE(JSON_EXTRACT(data, '$.fecha_inicio')) startDate,
         DATE_FORMAT(fecha_vencimiento_nueva, '%Y-%m-%d') endDate
       FROM base_central_clientes
       WHERE registro_valido = 1
         AND (
           REPLACE(UPPER(COALESCE(codigo, '')), ' ', '') LIKE ?
           OR REPLACE(UPPER(COALESCE(chasis, '')), ' ', '') LIKE ?
           OR REPLACE(UPPER(COALESCE(cedula, '')), ' ', '') LIKE ?
           OR REPLACE(UPPER(COALESCE(cliente, '')), ' ', '') LIKE ?
           OR REPLACE(UPPER(COALESCE(placa, '')), ' ', '') LIKE ?
           OR REPLACE(UPPER(COALESCE(imei, '')), ' ', '') LIKE ?
           OR REPLACE(UPPER(COALESCE(sim, '')), ' ', '') LIKE ?
           OR REPLACE(UPPER(COALESCE(marca, '')), ' ', '') LIKE ?
           OR REPLACE(UPPER(COALESCE(modelo, '')), ' ', '') LIKE ?
           OR REPLACE(UPPER(COALESCE(dealer, '')), ' ', '') LIKE ?
         )
       ORDER BY synced_at DESC, id DESC
       LIMIT ?`,
      [...Array(10).fill(like), limit]
    );
    return rows.map((row) => row as VaporVehicle);
  }

  private async searchCustomers(term: string, limit: number) {
    if (!this.customerPool) return [];
    const [rows] = await this.customerPool.query<RowDataPacket[]>(
      `SELECT
         placa plate,
         chasis chassis,
         cliente customer,
         ruc_cliente document
       FROM facturas_documentos
       WHERE
         REPLACE(UPPER(COALESCE(placa, '')), ' ', '') LIKE ?
         OR REPLACE(UPPER(COALESCE(chasis, '')), ' ', '') LIKE ?
         OR REPLACE(UPPER(COALESCE(cliente, '')), ' ', '') LIKE ?
         OR REPLACE(UPPER(COALESCE(ruc_cliente, '')), ' ', '') LIKE ?
       ORDER BY fecha_emision DESC, id DESC
       LIMIT ?`,
      [...Array(4).fill(`%${term}%`), limit]
    );
    return rows.map((row) => row as VaporCustomer);
  }

  private async lookupVehicles(vehicles: VehicleTelemetry[]) {
    const output = new Map<string, VaporVehicle>();
    const ids = Array.from(
      new Set(
        vehicles
          .flatMap((vehicle) => [vehicle.deviceId, vehicle.imei, ...(vehicle.lookupIds ?? [])])
          .map((value) => String(value ?? "").trim())
          .filter(Boolean)
      )
    );
    const plates = Array.from(new Set(vehicles.map((vehicle) => normalizePlate(vehicle.plate)).filter((plate) => plate && plate !== "SIN PLACA")));
    const chassis = Array.from(new Set(vehicles.map((vehicle) => normalizePlate(vehicle.chassis)).filter(Boolean)));
    const keys = Array.from(new Set([...ids, ...plates]));
    const missing = keys.filter((id) => !this.readCache(this.vehicleCache, id));

    for (const id of keys) {
      const cached = this.readCache(this.vehicleCache, id);
      if (cached) output.set(id, cached);
    }

    if (!missing.length || !this.vehiclePool) return output;

    if (this.basePool) {
      const allKeys = Array.from(new Set([...ids.map(normalizePlate), ...plates, ...chassis])).filter(Boolean);
      if (allKeys.length) {
        const placeholders = allKeys.map(() => "?").join(",");
        const [baseRows] = await this.basePool.query<RowDataPacket[]>(
          `SELECT
             imei,
             sim,
             chasis chassis,
             placa plate,
             marca brand,
             modelo model,
             anio_vehiculo year,
             color,
             dealer,
             estado_vehiculo serviceStatus,
             nombre_cliente owner,
             cedula document,
             telefono phone,
             email,
             direccion address,
             plataforma platform,
             tipo_dispositivo deviceType,
             tipo_red networkType,
             tipo_sim simType,
             fase_proceso phase,
             promocion benefit,
             DATE_FORMAT(fecha_instalacion, '%Y-%m-%d') installationDate,
             DATE_FORMAT(fecha_inicio, '%Y-%m-%d') startDate,
             DATE_FORMAT(fecha_vencimiento_actual, '%Y-%m-%d') endDate
           FROM Base_V1
           WHERE
             REPLACE(UPPER(COALESCE(imei, '')), ' ', '') IN (${placeholders})
             OR REPLACE(UPPER(COALESCE(chasis, '')), ' ', '') IN (${placeholders})
             OR REPLACE(UPPER(COALESCE(placa, '')), ' ', '') IN (${placeholders})
             OR REPLACE(UPPER(COALESCE(codigo_unico, '')), ' ', '') IN (${placeholders})
           LIMIT 1200`,
          [...allKeys, ...allKeys, ...allKeys, ...allKeys]
        );

        for (const row of baseRows) {
          const vehicle = row as VaporVehicle;
          for (const key of [vehicle.imei, normalizePlate(vehicle.plate), normalizePlate(vehicle.chassis)]) {
            if (key) {
              this.writeCache(this.vehicleCache, key, vehicle);
              output.set(key, vehicle);
            }
          }
        }
      }
    }

    const idPlaceholders = ids.length ? ids.map(() => "?").join(",") : "NULL";
    const platePlaceholders = plates.length ? plates.map(() => "?").join(",") : "NULL";
    const chassisPlaceholders = chassis.length ? chassis.map(() => "?").join(",") : "NULL";
    const [rows] = await this.vehiclePool.query<RowDataPacket[]>(
      `SELECT
         d.imei,
         d.sim,
         CAST(d.flespi_device_id AS CHAR) idFlespi,
         CAST(d.traccar_device_id AS CHAR) traccarDeviceId,
         v.chasis chassis,
         v.plate plate,
         v.brand brand,
         v.model model,
         v.year year,
         v.color color,
         v.engine engine,
         cc.name dealer,
         cc.code dealerCode,
         vd.vehicle_device_status serviceStatus,
         DATE_FORMAT(vd.installation_date, '%Y-%m-%d') installationDate,
         DATE_FORMAT(vd.start_date, '%Y-%m-%d') startDate,
         DATE_FORMAT(vd.end_date, '%Y-%m-%d') endDate
       FROM devices d
       LEFT JOIN vehicle_devices vd ON vd.device_id = d.id AND vd.deleted_at IS NULL
       LEFT JOIN vehicles v ON v.id = vd.vehicle_id AND v.deleted_at IS NULL
       LEFT JOIN cost_centers cc ON cc.id = v.cost_center_id
       WHERE d.deleted_at IS NULL
         AND (
           TRIM(d.imei) IN (${idPlaceholders})
           OR CAST(d.flespi_device_id AS CHAR) IN (${idPlaceholders})
           OR CAST(d.traccar_device_id AS CHAR) IN (${idPlaceholders})
           OR REPLACE(UPPER(v.plate), ' ', '') IN (${platePlaceholders})
           OR REPLACE(UPPER(v.chasis), ' ', '') IN (${chassisPlaceholders})
         )
       ORDER BY
         (vd.end_date IS NULL OR vd.end_date >= CURRENT_DATE) DESC,
         vd.start_date DESC,
         vd.id DESC
       LIMIT 1200`,
      [...ids, ...ids, ...ids, ...plates, ...chassis]
    );

    for (const row of rows) {
      const vehicle = row as VaporVehicle;
      for (const key of [vehicle.idFlespi, vehicle.traccarDeviceId, vehicle.imei, normalizePlate(vehicle.plate), normalizePlate(vehicle.chassis)]) {
        if (key) {
          this.writeCache(this.vehicleCache, key, vehicle);
          output.set(key, vehicle);
        }
      }
    }

    if (this.centralPool) {
      const allKeys = Array.from(new Set([...ids.map(normalizePlate), ...plates, ...chassis])).filter(Boolean);
      if (allKeys.length) {
        const placeholders = allKeys.map(() => "?").join(",");
        const [centralRows] = await this.centralPool.query<RowDataPacket[]>(
          `SELECT
             imei, sim, chasis chassis, placa plate, marca brand, modelo, anio year,
             JSON_UNQUOTE(JSON_EXTRACT(data, '$.color')) color,
             dealer, dealer_crm dealerCode, estado_vehiculo serviceStatus,
             cliente owner, cedula document, telefono phone, email,
             JSON_UNQUOTE(JSON_EXTRACT(data, '$.direccion')) address,
             dealer platform, tipo_dispositivo deviceType, tipo_red_equipo networkType,
             tipo_sim simType, JSON_UNQUOTE(JSON_EXTRACT(data, '$.fase')) phase,
             beneficios benefit,
             JSON_UNQUOTE(JSON_EXTRACT(data, '$.fecha_instalacion')) installationDate,
             JSON_UNQUOTE(JSON_EXTRACT(data, '$.fecha_inicio')) startDate,
             DATE_FORMAT(fecha_vencimiento_nueva, '%Y-%m-%d') endDate
           FROM base_central_clientes
           WHERE registro_valido = 1
             AND (
               REPLACE(UPPER(COALESCE(imei, '')), ' ', '') IN (${placeholders})
               OR REPLACE(UPPER(COALESCE(chasis, '')), ' ', '') IN (${placeholders})
               OR REPLACE(UPPER(COALESCE(placa, '')), ' ', '') IN (${placeholders})
               OR REPLACE(UPPER(COALESCE(codigo, '')), ' ', '') IN (${placeholders})
             )
           ORDER BY synced_at DESC, id DESC
           LIMIT 1200`,
          [...allKeys, ...allKeys, ...allKeys, ...allKeys]
        );

        for (const row of centralRows) {
          const vehicle = row as VaporVehicle;
          for (const key of [vehicle.imei, normalizePlate(vehicle.plate), normalizePlate(vehicle.chassis)]) {
            if (!key) continue;
            const merged = mergePreferred(output.get(key), vehicle);
            this.writeCache(this.vehicleCache, key, merged);
            output.set(key, merged);
          }
        }
      }
    }

    return output;
  }

  private async lookupCustomers(vehicles: VehicleTelemetry[]) {
    const output = new Map<string, VaporCustomer>();
    const keys = Array.from(
      new Set(
        vehicles
          .flatMap((vehicle) => [normalizePlate(vehicle.chassis), normalizePlate(vehicle.plate)])
          .filter((value): value is string => Boolean(value && value !== "SIN PLACA"))
      )
    );
    const missing = keys.filter((key) => !this.readCache(this.customerCache, key));

    for (const key of keys) {
      const cached = this.readCache(this.customerCache, key);
      if (cached) output.set(key, cached);
    }

    if (!missing.length || !this.customerPool) return output;

    const placeholders = missing.map(() => "?").join(",");
    const [rows] = await this.customerPool.query<RowDataPacket[]>(
      `SELECT
         placa plate,
         chasis chassis,
         cliente customer,
         ruc_cliente document
       FROM facturas_documentos
       WHERE REPLACE(UPPER(COALESCE(placa, '')), ' ', '') IN (${placeholders})
          OR REPLACE(UPPER(COALESCE(chasis, '')), ' ', '') IN (${placeholders})
       ORDER BY fecha_emision DESC, id DESC
       LIMIT 800`,
      [...missing, ...missing]
    );

    for (const row of rows) {
      const customer = row as VaporCustomer;
      const plateKey = normalizePlate(customer.plate);
      const chassisKey = normalizePlate(customer.chassis);
      if (plateKey && !output.has(plateKey)) {
        this.writeCache(this.customerCache, plateKey, customer);
        output.set(plateKey, customer);
      }
      if (chassisKey && !output.has(chassisKey)) {
        this.writeCache(this.customerCache, chassisKey, customer);
        output.set(chassisKey, customer);
      }
    }

    return output;
  }

  private readCache<T>(cache: Map<string, { expiresAt: number; value: T }>, key: string) {
    const cached = cache.get(key);
    if (!cached) return undefined;
    if (cached.expiresAt < Date.now()) {
      cache.delete(key);
      return undefined;
    }
    return cached.value;
  }

  private writeCache<T>(cache: Map<string, { expiresAt: number; value: T }>, key: string, value: T) {
    cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, value });
  }
}

interface VaporSearchRecord extends VaporVehicle {
  owner?: string;
  document?: string;
}

function safePlate(value: string | undefined) {
  const plate = normalizePlate(value);
  if (plate === "SINPLACA") return "SIN PLACA";
  if (!plate) return "SIN PLACA";
  if (/^\d{10,}$/.test(plate)) return "SIN PLACA";
  if (/^\d{5,9}$/.test(plate)) return "SIN PLACA";
  return plate;
}

function normalizePlate(value: string | undefined) {
  return String(value ?? "").trim().replace(/\s+/g, "").toUpperCase();
}

function sanitizeVehicle(vehicle: VehicleTelemetry) {
  const { lookupIds: _lookupIds, ...publicVehicle } = vehicle;
  return {
    ...publicVehicle,
    plate: safePlate(publicVehicle.plate),
  };
}

function sanitizeRecord(record: VaporSearchRecord) {
  return {
    id: record.imei || record.idFlespi || record.traccarDeviceId || normalizePlate(record.plate) || normalizePlate(record.chassis),
    deviceId: record.imei || record.idFlespi || record.traccarDeviceId || "",
    plate: safePlate(record.plate),
    model: [record.brand, record.model, record.year].filter(Boolean).join(" ") || "Vehiculo",
    owner: record.owner || "Cliente pendiente",
    document: record.document,
    phone: record.phone,
    email: record.email,
    address: record.address,
    chassis: record.chassis,
    imei: record.imei,
    sim: record.sim,
    brand: record.brand,
    year: record.year,
    color: record.color,
    engine: record.engine,
    dealer: record.dealer,
    dealerCode: record.dealerCode,
    serviceStatus: record.serviceStatus,
    platform: record.platform,
    deviceType: record.deviceType,
    networkType: record.networkType,
    simType: record.simType,
    phase: record.phase,
    benefit: record.benefit,
    installationDate: record.installationDate,
    startDate: record.startDate,
    endDate: record.endDate,
  };
}

function normalizeSearch(value: string | undefined) {
  return normalizePlate(value).replace(/[-_.]/g, "");
}

function recordKey(record: Pick<VaporVehicle, "imei" | "idFlespi" | "traccarDeviceId" | "plate" | "chassis">) {
  return (
    record.imei ||
    record.idFlespi ||
    record.traccarDeviceId ||
    normalizePlate(record.plate) ||
    normalizePlate(record.chassis) ||
    Math.random().toString(36)
  );
}

function mergePreferred(base: VaporVehicle | undefined, preferred: VaporVehicle) {
  const populated = Object.fromEntries(
    Object.entries(preferred).filter(([, value]) => value !== null && value !== undefined && value !== "")
  ) as VaporVehicle;
  return { ...base, ...populated };
}
