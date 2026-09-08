import { ResultSetHeader, RowDataPacket } from "mysql2";
import { pool } from "../db/pool";
import type { VehicleTelemetry } from "../utils/telemetry";

export async function upsertVehicle(vehicle: VehicleTelemetry) {
  await pool.execute<ResultSetHeader>(
    `INSERT INTO vehicles (device_id, plate, model, owner_name)
     VALUES (:deviceId, :plate, :model, :owner)
     ON DUPLICATE KEY UPDATE plate = VALUES(plate), model = VALUES(model), owner_name = VALUES(owner_name)`,
    {
      deviceId: vehicle.deviceId,
      plate: vehicle.plate ?? null,
      model: vehicle.model ?? null,
      owner: vehicle.owner ?? null,
    }
  );

  const [rows] = await pool.execute<RowDataPacket[]>("SELECT id FROM vehicles WHERE device_id = :deviceId", {
    deviceId: vehicle.deviceId,
  });
  return Number(rows[0].id);
}

export async function savePosition(vehicle: VehicleTelemetry) {
  const vehicleId = await upsertVehicle(vehicle);
  await pool.execute(
    `INSERT INTO vehicle_positions
      (vehicle_id, latitude, longitude, speed, heading, satellites, ignition, source, recorded_at)
     VALUES
      (:vehicleId, :lat, :lng, :speed, :heading, :satellites, :ignition, :source, FROM_UNIXTIME(:timestamp / 1000))`,
    {
      vehicleId,
      lat: vehicle.lat,
      lng: vehicle.lng,
      speed: vehicle.speed,
      heading: vehicle.heading ?? null,
      satellites: vehicle.satellites ?? null,
      ignition: vehicle.ignition == null ? null : vehicle.ignition ? 1 : 0,
      source: vehicle.source ?? "flespi",
      timestamp: vehicle.timestamp,
    }
  );
  return vehicleId;
}

export async function latestVehicles(limit = 300) {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT
       v.device_id deviceId,
       v.plate,
       v.model,
       p.latitude lat,
       p.longitude lng,
       p.speed,
       p.heading,
       p.satellites,
       p.ignition,
       UNIX_TIMESTAMP(p.recorded_at) * 1000 timestamp
     FROM vehicles v
     JOIN vehicle_positions p ON p.id = (
       SELECT p2.id FROM vehicle_positions p2
       WHERE p2.vehicle_id = v.id
       ORDER BY p2.recorded_at DESC
       LIMIT 1
     )
     ORDER BY p.recorded_at DESC
     LIMIT :limit`,
    { limit }
  );
  return rows;
}

export async function savePositions(vehicles: any[]) {
  for (const vehicle of vehicles) {
    await savePosition(vehicle);
  }
}

export async function todayRouteByDeviceId(deviceId: string) {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT
       p.latitude lat,
       p.longitude lng,
       p.speed,
       p.heading,
       UNIX_TIMESTAMP(p.recorded_at) * 1000 timestamp,
       DATE_FORMAT(p.recorded_at, '%H:%i:%s') time
     FROM vehicles v
     JOIN vehicle_positions p ON p.vehicle_id = v.id
     WHERE v.device_id = :deviceId
       AND DATE(p.recorded_at) = CURRENT_DATE
     ORDER BY p.recorded_at ASC
     LIMIT 2000`,
    { deviceId }
  );

  return rows;
}
